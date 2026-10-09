import { Table } from "@heswell/vuu-table";
import { VuuDataRowDto, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { type TableContainer } from "../core/table/TableContainer";
import {
  RemoteTableSubscription,
  type RemoteResourceMessageType,
  type RemoteTableSubscriptionOptions,
  type SubscriptionMode,
} from "@heswell/service-utils";
import {
  DefaultLifecycleEnabled,
  LifecycleEnabled,
} from "../toolbox/thread/LifecycleContainer";

export interface IProvider extends LifecycleEnabled {
  bind: (tableContainer: TableContainer) => void;
  load: (tableContainer: TableContainer) => Promise<void>;
  loaded: boolean;
  table: Table;
}

export const getRandom = <T = unknown>(list: T[]): T =>
  list[random(0, list.length - 1)];

export function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type BidAsk = { ask: number; bid: number };
export const setRandomBidAsk = (bidAsk: BidAsk) => {
  const mid = random(11, 1499) / 10;
  const spread = random(0.001, 0.005);
  bidAsk.ask = mid + spread / 2;
  bidAsk.bid = mid - spread / 2;
};

export const setRandomBidAskUpdate = (bidAsk: BidAsk) => {
  // const spread = bidAsk.ask - bidAsk.bid;
  const priceChange = (random(1, 4) / 1000) * (random(0, 1) > 0.5 ? 1 : -1);
  // const mid = random(11, 1499) / 10;
  // const spread = random(0.001, 0.005);
  bidAsk.ask = bidAsk.ask + priceChange;
  bidAsk.bid = bidAsk.bid + priceChange;
};

export type BidAskSize = { askSize: number; bidSize: number };
export const setRandomBidAskSize = (bidAsk: BidAskSize) => {
  bidAsk.askSize = random(1000, 100_000);
  bidAsk.bidSize = random(1000, 100_000);
};

export const setRandomBidAskSizeUpdate = (bidAsk: BidAskSize) => {
  bidAsk.askSize = Math.round((bidAsk.askSize * random(1, 15)) / 10);
  bidAsk.bidSize = Math.round((bidAsk.bidSize * random(1, 15)) / 10);
};

export type ProviderFactory = (table: Table) => IProvider;

export abstract class Provider
  extends DefaultLifecycleEnabled
  implements IProvider
{
  #loaded = false;
  #tableContainer: TableContainer | undefined;
  readonly lifecycleId: string;

  constructor(table: Table) {
    super();
    this.#table = table;
    this.lifecycleId = `provider-${table.name}`;
  }

  readonly #table: Table;

  get table() {
    return this.#table;
  }

  get loaded() {
    return this.#loaded;
  }

  // TODO will this ever be set to false ?
  set loaded(loaded: boolean) {
    this.#loaded = loaded;
  }

  bind(tableContainer: TableContainer) {
    if (
      this.#tableContainer !== undefined &&
      this.#tableContainer !== tableContainer
    ) {
      throw new Error(
        `[Provider:${this.table.name}] cannot bind to a second TableContainer`,
      );
    }
    this.#tableContainer = tableContainer;
  }

  async doStart() {
    if (!this.#tableContainer) {
      throw new Error(
        `[Provider:${this.table.name}] must be bound before it is started`,
      );
    }
    await this.load(this.#tableContainer);
    this.loaded = true;
  }

  abstract load(tableContainer: TableContainer): Promise<void>;

  protected insertRow(row: VuuDataRowDto) {
    const { schema } = this.table;
    const columns = schema.columns.map((col) => col.name);
    const colCount = columns.length;
    const dataRow: VuuRowDataItemType[] = Array(colCount);
    for (let i = 0; i < colCount; i++) {
      dataRow[i] = row[columns[i]];
    }
    this.table.insert(dataRow, false);
  }
}

export class NullProvider extends Provider {
  async load() {}
}

export type RemoteSubscriptionFactory = (
  options: RemoteTableSubscriptionOptions,
) => RemoteTableSubscription;

const defaultSubscriptionFactory: RemoteSubscriptionFactory = (options) =>
  new RemoteTableSubscription(options);

export interface RemoteServiceDetails {
  /**
   * columns defaults to the columns of the table. Rows are mapped to the
   * table's column order by name, so the order requested here is irrelevant.
   */
  columns?: string[];
  /** subscribe (default) = snapshot then live updates, snapshot = snapshot only */
  mode?: SubscriptionMode;
  /** @deprecated use mode, a value of ["snapshot"] maps to mode "snapshot" */
  remoteResourceMessageType?: RemoteResourceMessageType[];
  resource: string;
  url: string;
  /**
   * By default load resolves immediately, the table is populated when the
   * remote service becomes available. Set true to have startup wait until
   * the initial snapshot has been received.
   */
  waitForInitialSnapshot?: boolean;
}

const resolveMode = ({
  mode,
  remoteResourceMessageType,
}: RemoteServiceDetails): SubscriptionMode => {
  if (mode) {
    return mode;
  }
  if (
    remoteResourceMessageType?.length === 1 &&
    remoteResourceMessageType[0] === "snapshot"
  ) {
    return "snapshot";
  }
  return "subscribe";
};

/**
 * Populates a table from a resource published by a remote data service.
 * The remote service need not be available when the Vuu server starts,
 * connection is retried until it is. Live updates are applied and the
 * table is reconciled against a fresh snapshot after any reconnection.
 */
export abstract class RemoteProvider extends Provider {
  #loadPromise: Promise<void> | undefined;
  #subscription: RemoteTableSubscription | undefined;

  constructor(
    table: Table,
    private readonly subscriptionFactory: RemoteSubscriptionFactory = defaultSubscriptionFactory,
  ) {
    super(table);
  }

  get subscription() {
    return this.#subscription;
  }

  /**
   * True once the initial snapshot has been received.
   */
  get loaded() {
    return this.#subscription?.hasSnapshot ?? false;
  }

  set loaded(_: boolean) {
    // derived from subscription state
  }

  load(_: TableContainer) {
    if (this.#loadPromise === undefined) {
      const details = this.remoteServiceDetails();
      const { columns, resource, url, waitForInitialSnapshot = false } =
        details;
      const subscription = this.subscriptionFactory({
        columns,
        mode: resolveMode(details),
        name: `RemoteProvider:${this.table.name}`,
        resource,
        table: this.table,
        url,
      });
      this.#subscription = subscription;
      subscription.start();
      this.#loadPromise = waitForInitialSnapshot
        ? subscription.firstSnapshot.then(() => undefined)
        : Promise.resolve();
    }
    return this.#loadPromise;
  }

  requestStop() {
    this.#subscription?.stop();
  }

  doStop() {
    this.requestStop();
  }

  abstract remoteServiceDetails(): RemoteServiceDetails;
}
