// Command dox-desktop is the dox desktop client: a Wails window over a
// loopback HTTP surface that proxies `/v1` to a remote dox server.
//
// Two front ends share one backend:
//   - default: the native window (this file), plus tray and system notifications
//   - `-serve <addr>`: the same HTTP surface with no window, so the UI can be
//     driven in a plain browser during development and smoke tests
//
// The desktop app never runs a dox server and never stores domain data: the
// server stays the only source of truth, exactly like the CLI and web UI.
package main

import (
	"bytes"
	"context"
	"embed"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io/fs"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/lin-snow/dox/apps/desktop/internal/feed"
	"github.com/lin-snow/dox/apps/desktop/internal/proxy"
	"github.com/lin-snow/dox/apps/desktop/internal/server"
	"github.com/lin-snow/dox/apps/desktop/internal/store"
)

//go:embed all:dist
var assets embed.FS

// version is injected at build time (-ldflags -X main.version=...).
var version = "dev"

const appName = "dox"

func main() {
	serveAddr := flag.String("serve", "", "serve the UI on this address instead of opening a window (development and smoke tests)")
	configPath := flag.String("config", "", "state directory (default: the OS config directory)")
	keyringKind := flag.String("keyring", "os", "credential store: os or memory (memory never touches the system keychain)")
	reminderInterval := flag.Duration("reminder-interval", 30*time.Second, "how often to poll the reminder ledger")
	debug := flag.Bool("debug", false, "log at debug level")
	flag.Parse()

	level := slog.LevelInfo
	if *debug {
		level = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})))

	var ring store.Keyring
	switch *keyringKind {
	case "", "os":
		ring = store.OSKeyring()
	case "memory":
		ring = store.NewMemoryKeyring()
	default:
		log.Fatalf("unknown -keyring %q (want os or memory)", *keyringKind)
	}

	dir := *configPath
	if dir == "" {
		dir = configDir()
	}
	state, err := store.OpenWith(dir, ring)
	if err != nil {
		log.Fatalf("open app state: %v", err)
	}
	if imported, err := state.ImportCLI(); err != nil {
		slog.Warn("could not import CLI credentials", "err", err)
	} else if imported {
		slog.Info("imported credentials from ~/.config/dox/config.toml")
	}

	var unread atomic.Int64
	hub := server.NewHub()

	handler := server.New(server.Options{
		Store:   state,
		Proxy:   proxy.New(proxy.Options{Base: state.Base, Token: state.Token}),
		Assets:  mustSub(assets, "dist"),
		Hub:     hub,
		Version: version,
		Unread:  func() int { return int(unread.Load()) },
	})

	if *serveAddr != "" {
		// Headless: the reminder poller still runs (so unread counts and the
		// event stream behave exactly as in the window) but nothing is shown.
		startFeed(state, desktopSink{hub: hub, unread: &unread}, *reminderInterval)
		slog.Info("serving without a window", "addr", *serveAddr)
		if err := http.ListenAndServe(*serveAddr, handler); err != nil {
			log.Fatalf("serve: %v", err)
		}
		return
	}

	// Loopback only: the UI is same-origin with this listener, which is what
	// removes CORS from the picture entirely.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("listen: %v", err)
	}
	uiServer := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := uiServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("ui server: %v", err)
		}
	}()
	defer func() { _ = uiServer.Close() }()

	var notifier *notifications.NotificationService
	if notificationsUsable() {
		notifier = notifications.New()
	} else {
		slog.Warn("running outside an .app bundle: system notifications disabled")
	}

	app := application.New(application.Options{
		Name:        appName,
		Description: "self-hosted todo",
		Services: func() []application.Service {
			if notifier == nil {
				return nil
			}
			return []application.Service{application.NewService(notifier)}
		}(),
		Mac: application.MacOptions{
			// Closing the window hides it: reminders keep arriving while the
			// app sits in the tray.
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:      "main",
		Title:     appName,
		Width:     1240,
		Height:    820,
		MinWidth:  960,
		MinHeight: 620,
		URL:       fmt.Sprintf("http://%s/", listener.Addr().String()),

		// Real vibrancy: the window backdrop blurs the desktop, and the webview
		// paints over it with translucent CSS. The webview only becomes
		// transparent when built with -tags private_mac_apis (see the
		// desktop-build recipe); without it the glass is hidden behind an
		// opaque webview and the UI falls back to its own painted backdrop.
		BackgroundType:   application.BackgroundTypeTranslucent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInset,
			Backdrop: application.MacBackdropLiquidGlass,
			// Keeps the traffic lights draggable without a native title bar.
			InvisibleTitleBarHeight: 38,
		},
	})
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		window.Hide()
		event.Cancel()
	})

	tray := app.SystemTray.New()
	if icon := trayIcon(); icon != nil {
		if runtime.GOOS == "darwin" {
			tray.SetTemplateIcon(icon)
		} else {
			tray.SetIcon(icon)
		}
	}

	menu := app.NewMenu()
	statusItem := menu.Add("No reminders")
	statusItem.SetEnabled(false)
	menu.AddSeparator()
	menu.Add("Open dox").OnClick(func(*application.Context) {
		window.Show()
		window.Focus()
	})
	menu.AddSeparator()
	menu.Add("Quit dox").OnClick(func(*application.Context) {
		app.Quit()
	})
	tray.SetMenu(menu)

	if notifier != nil {
		if authorized, err := notifier.CheckNotificationAuthorization(); err == nil && !authorized {
			if _, err := notifier.RequestNotificationAuthorization(); err != nil {
				slog.Warn("notification permission denied", "err", err)
			}
		}
		notifier.OnNotificationResponse(func(result notifications.NotificationResult) {
			todoID, _ := result.Response.UserInfo["todoId"].(string)
			window.Show()
			window.Focus()
			if todoID != "" {
				hub.Publish(server.Event{Type: "open", TodoID: todoID})
			}
		})
	}

	startFeed(state, desktopSink{hub: hub, unread: &unread, item: statusItem, notifier: notifier}, *reminderInterval)

	if err := app.Run(); err != nil {
		log.Fatalf("run: %v", err)
	}
}

// notificationsUsable reports whether this process can talk to the macOS
// notification center. UNUserNotificationCenter aborts the process with an
// Objective-C exception (uncatchable from Go) unless the binary runs from an
// .app bundle, so calling it prematurely is a crash, not an error.
func notificationsUsable() bool {
	if runtime.GOOS != "darwin" {
		return true
	}
	executable, err := os.Executable()
	if err != nil {
		return false
	}
	return strings.Contains(executable, ".app/Contents/MacOS/")
}

// startFeed runs the reminder poller for the lifetime of the process, in both
// windowed and headless mode.
func startFeed(state *store.Store, sink feed.Sink, interval time.Duration) {
	go feed.Run(context.Background(), feed.HTTPSource{
		Client: &http.Client{Timeout: 20 * time.Second},
		Base:   state.Server,
		Token:  state.Token,
	}, sink, feed.Config{
		Interval: interval,
		Enabled: func() bool {
			return state.SignedIn() && state.Prefs().NotificationsEnabled
		},
	})
}

// desktopSink turns polled reminders into native notifications, and keeps the
// tray status line in step with the unread count. Both capabilities are
// optional: `-serve` passes neither, and an unbundled macOS build passes a nil
// notifier.
type desktopSink struct {
	hub      *server.Hub
	unread   *atomic.Int64
	item     *application.MenuItem
	notifier *notifications.NotificationService
}

func (s desktopSink) Notify(reminder feed.Reminder) {
	title := reminder.TodoTitle
	if title == "" {
		title = "a todo is due"
	}
	if s.notifier == nil {
		slog.Info("reminder", "todo", reminder.TodoID, "title", title)
	} else {
		s.notifier.SendNotification(notifications.NotificationOptions{
			ID:    reminder.ID,
			Title: title,
			Body:  "due now — click to open",
			Data:  map[string]any{"todoId": reminder.TodoID},
		})
	}
	s.hub.Publish(server.Event{Type: "reminder", TodoID: reminder.TodoID, Title: title})
}

func (s desktopSink) Unread(count int) {
	s.unread.Store(int64(count))
	if s.item == nil {
		return
	}
	if count > 0 {
		s.item.SetLabel(fmt.Sprintf("%d due", count))
	} else {
		s.item.SetLabel("No reminders")
	}
}

func configDir() string {
	base, err := os.UserConfigDir()
	if err != nil {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "dox-desktop")
}

func mustSub(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		log.Fatalf("embedded assets: %v", err)
	}
	return sub
}

// trayIcon draws a small diamond: a template icon on macOS (black + alpha, the
// system inverts it), and a slate mark elsewhere. Generated so the repo carries
// no binary icon that could drift from the bundle.
func trayIcon() []byte {
	const size = 22
	img := image.NewNRGBA(image.Rect(0, 0, size, size))

	ink := color.NRGBA{R: 0x40, G: 0x5a, B: 0x62, A: 0xff}
	if runtime.GOOS == "darwin" {
		ink = color.NRGBA{A: 0xff}
	}
	for y := range size {
		for x := range size {
			dx, dy := x-10, y-10
			if dx < 0 {
				dx = -dx
			}
			if dy < 0 {
				dy = -dy
			}
			if dx+dy <= 7 {
				img.SetNRGBA(x, y, ink)
			}
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		slog.Warn("tray icon", "err", err)
		return nil
	}
	return buf.Bytes()
}
