import { getFullRange } from "@vuu-ui/vuu-utils";
import {
  MessageOut,
  MessageTypeOut,
  RowMeta,
  UpdateMessage,
} from "./serverTypes";

const EMPTY_ARRAY: MessageOut[] = [];
const ROWSET = "rowset";
const UPDATE = "update";
const FILTER_DATA = "filterData";

type MessageLike = {
  type: string;
};

export class MessageQueue<T extends MessageLike = any> {
  private _queue: T[];

  constructor() {
    this._queue = [];
  }

  get length() {
    return this._queue.length;
  }
  set length(val) {
    this._queue.length = val;
  }
  get queue() {
    const q = this._queue.slice();
    this._queue.length = 0;
    return q;
  }

  push(message: T, rowMeta?: RowMeta) {
    if (message.type === MessageTypeOut.Update) {
      mergeAndPurgeUpdate<T>(this._queue, message);
    } else if (message.type === MessageTypeOut.Rowset && rowMeta) {
      // if (message.data.rows.length === 0 && typeof message.size === 'number' && message.size > 0) {
      //   return;
      // }
      mergeAndPurgeRowset(this._queue, message, rowMeta);
    } else {
      //onsole.log(`MessageQueue ${type} `);
    }
    this._queue.push(message);
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

  extract(test: (message: any) => boolean) {
    if (this._queue.length === 0) {
      return EMPTY_ARRAY;
    } else {
      return extractMessages(this._queue, test);
    }
  }

  extractAll() {
    const messages = this._queue.slice();
    this._queue.length = 0;
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
const mergeAndPurgeUpdate = <T extends MessageLike>(queue: T[], message: T) => {
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

function extractMessages(queue: any[], test: (message: any) => boolean) {
  var extract = [];

  for (var i = queue.length - 1; i >= 0; i--) {
    if (test(queue[i])) {
      extract.push(queue.splice(i, 1)[0]);
    }
  }

  extract.reverse();
  return extract;
}

const formatMessage = (msg: any) => ` type: ${msg.type} 
    rows: [${
      msg.data && msg.data.rows && msg.data.rows.map((row: any[]) => row[7])
    }]`;
