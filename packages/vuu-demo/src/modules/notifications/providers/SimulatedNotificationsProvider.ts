import { Table } from "@heswell/vuu-table";
import { LifeCycleRunner, Provider } from "@heswell/vuu-server";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import logger from "../../../logger";

type NotificationTemplate = [
  type: string,
  title: string,
  messageFormat: string,
  level: string,
  durationMs: number,
  source: string,
  priority: number,
  audience: string,
];

const sampleTemplates: NotificationTemplate[] = [
  ["toast", "Order Execution", "Order #%04d filled %d shares of AAPL at $%d.%02d", "INFO", 12000, "OMS", 2, "trader"],
  ["toast", "Risk Limit Alert", "Account ACC-%04d exceeded intraday VaR limit by %d%%", "WARNING", 15000, "RISK", 5, "risk_manager"],
  ["toast", "Feed Synchronization", "Connected to pricing feed NYC-%02d with latency %dms", "INFO", 10000, "PRICING", 1, "admin"],
  ["toast", "Connection Warning", "Intermittent packet loss detected on gateway LDN-%02d", "WARNING", 14000, "GATEWAY", 3, "admin"],
  ["toast", "Order Rejection", "Order #%04d rejected by exchange: Insufficient margin", "ERROR", 18000, "OMS", 10, "all"],
  ["banner", "System Maintenance", "Scheduled system maintenance will begin in %d minutes", "WARNING", 45000, "SYSTEM", 5, "all"],
  ["banner", "Market Status", "US Equity markets are now OPEN. Trading session #%d active", "INFO", 60000, "SYSTEM", 1, "all"],
];

const MAX_ACTIVE_NOTIFICATIONS = 8;
const INITIAL_NOTIFICATIONS = 3;
const CYCLE_TIME_MS = 4_000;

const randomInt = (bound: number) => Math.floor(Math.random() * bound);

/**
 * Minimal implementation of the subset of Java String.format used by
 * the message templates: %d, %0nd and %%. Args are consumed in order.
 */
export const formatMessage = (format: string, ...args: number[]) => {
  let argIndex = 0;
  return format.replace(/%(0(\d+))?d|%%/g, (match, _, width) => {
    if (match === "%%") {
      return "%";
    }
    const value = String(args[argIndex++]);
    return width ? value.padStart(Number(width), "0") : value;
  });
};

export class SimulatedNotificationsProvider extends Provider {
  #activeNotifications = new Map<string, number>();
  #runner: LifeCycleRunner;
  override readonly lifecycleId: string;

  constructor(table: Table) {
    super(table);
    this.lifecycleId = `simulatedNotificationsProvider-${table.name}`;
    this.#runner = new LifeCycleRunner(
      "simulatedNotificationsProvider",
      () => this.runOnce(),
      CYCLE_TIME_MS,
    );
  }

  async load() {
    logger.info(
      "Starting SimulatedNotificationsProvider - populating initial notifications",
    );
    for (let i = 0; i < INITIAL_NOTIFICATIONS; i++) {
      this.generateRandomNotification();
    }
    await this.#runner.doStart();
  }

  async doStop() {
    await this.#runner.doStop();
  }

  requestStop() {
    this.#runner.requestStop();
  }

  private runOnce() {
    try {
      const now = Date.now();

      // 1. Clean up expired notifications
      for (const [id, expiryTime] of Array.from(this.#activeNotifications)) {
        if (expiryTime < now) {
          this.table.delete(id);
          this.#activeNotifications.delete(id);
          logger.debug(`Expired and deleted notification ${id}`);
        }
      }

      // 2. Generate new notifications if we have fewer than 8 active notifications
      if (this.#activeNotifications.size < MAX_ACTIVE_NOTIFICATIONS) {
        this.generateRandomNotification();
      }
    } catch (e) {
      logger.error(
        { err: e },
        "Error occurred in SimulatedNotificationsProvider runOnce",
      );
    }
  }

  private generateRandomNotification() {
    const id = crypto.randomUUID();
    const now = Date.now();
    const [
      type,
      title,
      messageFormat,
      level,
      duration,
      source,
      priority,
      audience,
    ] = sampleTemplates[randomInt(sampleTemplates.length)];
    const expiryTime = now + duration;

    const message = messageFormat.includes("%")
      ? formatMessage(
          messageFormat,
          randomInt(9000) + 1000,
          randomInt(90) * 10 + 100,
          randomInt(200) + 50,
          randomInt(99),
        )
      : messageFormat;

    const rowData: Record<string, VuuRowDataItemType> = {
      id,
      type,
      expiryTime,
      title,
      message,
      level,
      audience,
      source,
      priority,
    };

    this.table.upsert(this.toDataRow(rowData));
    this.#activeNotifications.set(id, expiryTime);
    logger.debug(`Generated simulated notification ${id} (${title})`);
  }

  private toDataRow(rowData: Record<string, VuuRowDataItemType>) {
    const { columnMap, schema } = this.table;
    const row: VuuDataRow = Array(schema.columns.length);
    for (const [name, value] of Object.entries(rowData)) {
      const idx = columnMap[name];
      if (idx !== undefined) {
        row[idx] = value;
      }
    }
    return row;
  }
}
