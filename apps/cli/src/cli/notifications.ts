import { withContext, type GlobalOpts } from "./context";

interface NotificationListOpts extends GlobalOpts {
  unread?: boolean;
  limit?: string;
  /** `--ack` with no ids yields true; with ids yields the list. */
  ack?: boolean | string[];
}

export const list = (opts: NotificationListOpts) =>
  withContext(opts, async ({ notifications, output }) => {
    const limit = opts.limit === undefined ? undefined : Number(opts.limit);
    if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
      throw new Error("--limit must be a positive number");
    }
    const list = await notifications.list({ limit, unreadOnly: opts.unread });
    output.reminders(list);
  });

export const ack = (ids: string[], opts: NotificationListOpts) =>
  withContext(opts, async ({ notifications, output }) => {
    const acked = await notifications.ack(ids.length > 0 ? ids : undefined);
    const scope = ids.length > 0 ? `${ids.length} selected` : "all unread";
    output.ok(
      `Acknowledged ${acked} reminder${acked === 1 ? "" : "s"} (${scope})`,
      {
        acked,
      },
    );
  });
