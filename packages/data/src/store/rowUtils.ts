
export function isEmptyRow(row){
    return row[0] === undefined;
}

export function indexRows(rows, indexField) {
    return addRowsToIndex(rows, {}, indexField)
}

export function addRowsToIndex(rows, index, indexField){
    for (let idx = 0, len=rows.length; idx < len; idx++) {
        index[rows[idx][indexField]] = idx;
    }
    return index;
}

export function update(rows, updates, {IDX}) {
    const results = rows.slice();

    for (let i = 0; i < updates.length; i++) {
        const [idx, ...fieldUpdates] = updates[i];
        // slow, refactor for performance

        let row;
        for (let ii = 0; ii < rows.length; ii++) {
            if (rows[ii][IDX] === idx) {
                row = rows[ii].slice();
                for (let j = 0; j < fieldUpdates.length; j += 2) {
                    row[fieldUpdates[j]] = fieldUpdates[j + 1];
                }
                results[ii] = row;

                break;

            }
        }
    }

    return results;
}


// TODO create a pool of these and reuse them
function emptyRow(idx, {IDX, count}){
    const row = Array(count);
    row[IDX] = idx;
    return row;
}

export function arrayOfIndices(length){
    // not the neatest, but far and away the fastest way to do this ...
    const result = Array(length);
    for (let i=0;i<length;i++){
        result[i] = i;
    }
    return result;
}

