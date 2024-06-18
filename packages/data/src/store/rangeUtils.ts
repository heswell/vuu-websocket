export const NULL_RANGE: Range = {from: 0, to: 0};

export type Range = {
    bufferSize?: number;
    from: number;
    reset?: true;
    to: number;
}

// If the requested range overlaps the last sent range, we only need send the
// newly exposed section of the range. The client will manage dropping off
// the expired section.
//
// |----------------------------------| _range
//  ++++++|----------------------------------| prevRange
//  
//
//
//  |------------------------------------| _range
//  |----------------------------------|+  prevRange
//TODO do we still need these calls to getFullRange ?
export function getDeltaRange(oldRange: Range, newRange: Range): Range{
    const {from: oldLo, to: oldHi} = oldRange /*getFullRange(oldRange)*/;
    const {from: newLo, to: newHi} = newRange /*getFullRange(newRange)*/;

    if (newLo >= oldLo && newHi <= oldHi){
        // reduced range, no delta
        return {from: newHi, to: newHi};

    } else if (newLo >= oldHi || newHi < oldLo){
        return {from: newLo, to: newHi};
    } else if (newLo === oldLo && newHi === oldHi){
        return {from: oldHi, to: oldHi};
    } else {
        return {
            from: newLo < oldLo ? newLo: oldHi,
            to: newHi > oldHi ? newHi: oldLo
        };
    }
}

export function resetRange({from,to,bufferSize=0}: Range): Range{
    return {
        from: 0,
        to: to-from,
        bufferSize,
        reset: true
    };
}

export function getFullRange({from,to,bufferSize=0}: Range): Range{
    return {
        from: Math.max(0, from - bufferSize),
        to: to + bufferSize
    };
}

export function withinRange(range: Range, index: number, offset=0) {
    return index-offset >= range.from && index-offset < range.to;
}

const SAME = 0;
const FWD = 2;
const BWD = 4;
const CONTIGUOUS = 8;
const OVERLAP = 16;
const REDUCE = 32;
const EXPAND = 64;
const NULL = 128;

export const RangeFlags = {
    SAME,
    FWD,
    BWD,
    CONTIGUOUS,
    OVERLAP,
    REDUCE,
    EXPAND,
    NULL,
    GAP: ~(CONTIGUOUS | OVERLAP | REDUCE)
}


export function compareRanges(range1: Range, range2: Range){
    if (range2.from === 0 && range2.to === 0){
        return NULL;
    } else if (range1.from === range2.from && range1.to === range2.to){
        return SAME;
    } else if (range2.to > range1.to){
        if (range2.from > range1.to){
            return FWD;
        } else if (range2.from === range1.to){
            return FWD + CONTIGUOUS;
        } else if (range2.from >= range1.from){
            return FWD + OVERLAP;
        } else {
            return EXPAND;
        }
    } else if (range2.from < range1.from){
        if (range2.to < range1.from){
            return BWD;
        } else if (range2.to === range1.from){
            return BWD + CONTIGUOUS;
        } else if (range2.to > range1.from){
            return BWD + OVERLAP;
        } else {
            return EXPAND;
        }
    } else if (range2.from > range1.from) {
        return REDUCE + FWD;
    } else {
        return REDUCE + BWD
    }
}
