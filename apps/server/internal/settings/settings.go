// Package settings is a typed wrapper over the settings KV table.
package settings

import (
	"context"
	"database/sql"
	"errors"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const KeyRegistrationOpen = "registration_open"

// GetRegistrationOpen returns the current value, defaulting to false when unset.
func GetRegistrationOpen(ctx context.Context, q *queries.Queries) (bool, error) {
	v, err := q.GetSetting(ctx, KeyRegistrationOpen)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return v == "true", nil
}

func SetRegistrationOpen(ctx context.Context, q *queries.Queries, open bool) error {
	val := "false"
	if open {
		val = "true"
	}
	return q.UpsertSetting(ctx, queries.UpsertSettingParams{Key: KeyRegistrationOpen, Value: val})
}
