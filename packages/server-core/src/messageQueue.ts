import { getFullRange } from "@vuu-ui/vuu-utils";
import { IMessageQueue, RowMeta } from "@heswell/server-types";
import {
  VuuRange,
  ServerToClientTableRows,
  VuuClientMessage,
} from "@vuu-ui/vuu-protocol-types";

export interface ViewportMessage {
  viewport: string;
}

export const MessageTypeOut = {
  Rowset: "rowset",
  Update: "update",
};

export interface RowsetMessage extends ViewportMessage {
  type: typeof MessageTypeOut.Rowset;
}
export interface UpdateMessage extends ViewportMessage {
  range: VuuRange;
  type: typeof MessageTypeOut.Update;
  updates: any[];
}

export type MessageOut = RowsetMessage | UpdateMessage;

const EMPTY_ARRAY: MessageOut[] = [];
const ROWSET = "rowset";
const UPDATE = "update";

export class MessageQueue implements IMessageQueue {
  #queue: VuuClientMessage[];

  constructor() {
    this.#queue = [];
  }

  get length() {
    return this.#queue.length;
  }
  set length(val) {
    this.#queue.length = val;
  }
  get queue() {
    const q = this.#queue.slice();
    this.#queue.length = 0;
    return q;
  }

  push(message: VuuClientMessage, rowMeta?: RowMeta) {
    // if (message.type === MessageTypeOut.Update) {
    //   mergeAndPurgeUpdate(this.#queue, message);
    // } else if (message.type === MessageTypeOut.Rowset && rowMeta) {
    //   mergeAndPurgeRowset(this.#queue, message, rowMeta);
    // } else {
    //   //onsole.log(`MessageQueue ${type} `);
    // }
    this.#queue.push(message);
  }

  purgeViewport(viewport: string) {
    console.log(`purgeViewport`);
    // this._queue = this._queue.filter((batch) => batch.viewport !== viewport);
  }

  // currentRange(){
  //     for (let i = 0; i<this._queue.length; i++){
  //         const message = this._queue[i];
  //         const {data} = message;
  //         if (data){
  //             console.log(`message-queue.currentRange ${message.type} ${JSON.stringify(data.range)}`)
  //         }
  //     }
  // }

  extract(test: (message: VuuClientMessage) => boolean) {
    if (this.#queue.length === 0) {
      return EMPTY_ARRAY;
    } else {
      return extractMessages(this.#queue, test);
    }
  }

  extractAll() {
    const messages = this.#queue.slice();
    this.#queue.length = 0;
    return messages;
  }
}

// we need to know the current range in order to be able to merge rowsets which are still valid
function mergeAndPurgeRowset(queue: any[], message: any, meta: RowMeta) {
  const {
    viewport,
    data: { rows, size, range, offset = 0 },
  } = message;
  const { from, to } = getFullRange(range);
  const low = from + offset;
  const high = to + offset;

  if (rows.length === 0) {
    console.log(`MESSAGE PUSHED TO MESAGEQ WITH NO ROWS`);
    return;
  }

  const { IDX } = meta;

  for (var i = queue.length - 1; i >= 0; i--) {
    let { type, viewport: vp, data } = queue[i];

    if (vp === viewport) {
      if (type === ROWSET) {
        // snapshot. filterData, searchData

        var {
          range: { lo: lo1, hi: hi1 },
        } = queue[i].data;

        if (lo1 >= to || hi1 < from) {
          // no overlap, purge the message
        } else {
          var overlaps = data.rows.filter(
            (row: any[]) => row[IDX] >= low && row[IDX] < high
          );

          if (from < lo1) {
            message.data.rows = rows.concat(overlaps);
          } else {
            message.data.rows = overlaps.concat(rows);
          }
        }
        queue.splice(i, 1);
      } else if (type === UPDATE) {
        // if we have updates for rows within the current rowset, discard them - the rowset
        // represents latest data.
        let validUpdates = queue[i].updates.filter((u: any[]) => {
          let idx = u[IDX];

          if (typeof rows[IDX] === "undefined") {
            console.warn(
              `MessageQueue:about to error, these are the rows that have been passed `
            );
            console.warn(`[${rows.map((r: any[]) => r[IDX]).join(",")}]`);
          }

          let min = rows[0][IDX];
          let max = rows[rows.length - 1][IDX];

          return (
            idx >= low &&
            idx < high && // within range
            idx < size && // within dataset
            (idx < min || idx >= max)
          ); // NOT within new rowset
        });

        if (validUpdates.length) {
          queue[i].updates = validUpdates;
        } else {
          //onsole.log(`MessageQueue:purging updates that are no longer applicable`);
          queue.splice(i, 1);
        }
      }
    }
  }
}

// we need to know the current range in order to be able to merge rowsets which are still valid
const mergeAndPurgeUpdate = (
  queue: VuuClientMessage[],
  message: VuuClientMessage
) => {
  //onsole.log(`mergeAndPurge: update message ${JSON.stringify(message)}` );
  /*
  var {
    viewport,
    range: { from: lo, to: hi }
  } = message;

  //onsole.log(`mergeAndPurge: update message ${lo} - ${hi}   ${JSON.stringify(queue)}` );

  for (var i = queue.length - 1; i >= 0; i--) {
    if (queue[i].type === message.type && queue[i].viewport === viewport) {
      //onsole.log(`we have a match for an update ${i} of ${queue.length}   ${JSON.stringify(queue[i].updates)}`)

      var { lo: lo1, hi: hi1 } = queue[i].updates;

      if (lo1 >= hi || hi1 < lo) {
        // no overlap, purge the message
      } else {
        // merge updates for same row(s)
        //console.log(`mergeAndPurgeUpdates ${JSON.stringify(queue[i])} ${JSON.stringify(message.updates)}`)
      }
      console.log(
        `merging rowset current range [${lo},${hi}] [${queue[i].rows.lo},${queue[i].rows.hi}]`
      );
      queue.splice(i, 1);
    }
  }
  */
};

function extractMessages(
  queue: VuuClientMessage[],
  test: (message: VuuClientMessage) => boolean
) {
  var extract = [];

  for (var i = queue.length - 1; i >= 0; i--) {
    if (test(queue[i])) {
      extract.push(queue.splice(i, 1)[0]);
    }
  }

  extract.reverse();
  return extract;
}
