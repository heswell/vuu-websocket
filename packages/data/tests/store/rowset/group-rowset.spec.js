const {
  GroupRowSet, 
  filter: {EQUALS, IN, NOT_IN}, 
  columnUtils: {metaData}
} = require('../../dist/index.js');

const {
    getInstrumentRowset,
    getTestRowset,
    getTestTableAndRowset,
    getEmptyTestTableAndRowset,
    columns: rowset_columns,
    columns_with_aggregation: rowset_columns_with_aggregation,
    instrumentColumns,
    GROUP_COL_1,
    GROUP_COL_2,
    GROUP_COL_3  
} = require('../../test-data.js');

describe('construction', () => {
    test('correctly groups by a single column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        const { groupRows, sortSet } = rowSet;
        const { rows } = rowSet.setRange({ lo: 0, hi: 4 });
        expect(rows).toEqual([
            [null, 'G1', null, null, null, null, 100, 0, -1, 8, 'G1', 0, null, 0, undefined, undefined],
            [null, 'G2', null, null, null, null, 101, 0, -1, 8, 'G2', 0, null, 8, undefined, undefined],
            [null, 'G3', null, null, null, null, 102, 0, -1, 8, 'G3', 0, null, 16, undefined, undefined]
        ]);
        // base dataset is already in order, so sortSet reflects this
        expect(sortSet).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
        expect(groupRows.length).toBe(3);
    });

    test('correctly groups by two columns', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2])
        const { groupRows, sortSet } = rowSet;

        const { rows } = rowSet.setRange({ lo: 0, hi: 4 });
        expect(rows).toEqual([
            [null, 'G1', null, null, null, null, 100, 0, -2, 8, 'G1', 0, null, 1, undefined, undefined],
            [null, 'G2', null, null, null, null, 101, 0, -2, 8, 'G2', 0, null, 4, undefined, undefined],
            [null, 'G3', null, null, null, null, 102, 0, -2, 8, 'G3', 0, null, 8, undefined, undefined]
        ]);

        expect(sortSet).toEqual([4, 5, 6, 7, 0, 1, 2, 3, 10, 11, 12, 13, 14, 15, 8, 9, 20, 21, 16, 17, 18, 19, 22, 23]);
        expect(groupRows.length).toBe(12);

    })

    test('correctly groups by three columns', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3])
        const { groupRows } = rowSet;
        const { rows } = rowSet.setRange({ lo: 0, hi: 4 });

        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -3, 8, 'G1'],
            [101, 0, -3, 8, 'G2'],
            [102, 0, -3, 8, 'G3']
        ]);
        expect(groupRows.length).toBe(24);

        expect(groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0,  0,  -3, 8, 'G1', null, 1],
            [1,  0,  -2, 4, 'G1/I2', 0, 2],
            [2,  0,  -1, 2, 'G1/I2/T3', 1, 0],
            [3,  0,  -1, 1, 'G1/I2/T4', 1, 2],
            [4,  0,  -1, 1, 'G1/I2/T5', 1, 3],
            [5,  0,  -2, 4, 'G1/U2', 0, 6],
            [6,  0,  -1, 2, 'G1/U2/T3', 5, 4],
            [7,  0,  -1, 2, 'G1/U2/T4', 5, 6],
            [8,  0,  -3, 8, 'G2', null, 9],
            [9,  0,  -2, 2, 'G2/I2', 8, 10],
            [10, 0,  -1, 2, 'G2/I2/T3', 9, 8],
            [11, 0,  -2, 4, 'G2/O2', 8, 12],
            [12, 0,  -1, 4, 'G2/O2/T3', 11, 10],
            [13, 0,  -2, 2, 'G2/U2', 8, 14],
            [14, 0,  -1, 2, 'G2/U2/T3', 13, 14],
            [15, 0,  -3, 8, 'G3', null, 16],
            [16, 0,  -2, 2, 'G3/A2', 15, 17],
            [17, 0,  -1, 2, 'G3/A2/T3', 16, 16],
            [18, 0,  -2, 4, 'G3/E2', 15, 19],
            [19, 0,  -1, 4, 'G3/E2/T3', 18, 18],
            [20, 0,  -2, 1, 'G3/I2', 15, 21],
            [21, 0,  -1, 1, 'G3/I2/T3', 20, 22],
            [22, 0,  -2, 1, 'G3/O2', 15, 23],
            [23, 0,  -1, 1, 'G3/O2/T3', 22, 23]
        ])
    })

    test('correctly groups by four columns', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3, ['Qty', 'asc']])
        const { groupRows } = rowSet;
        const { rows } = rowSet.setRange({ lo: 0, hi: 4 });

        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -4, 8, 'G1'],
            [101, 0, -4, 8, 'G2'],
            [102, 0, -4, 8, 'G3']
        ]);

        expect(groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0,  0, -4, 8, 'G1', null, 1],
            [1,  0, -3, 4, 'G1/I2', 0, 2],
            [2,  0, -2, 2, 'G1/I2/T3', 1, 3],
            [3,  0, -1, 1, 'G1/I2/T3/45', 2, 0],
            [4,  0, -1, 1, 'G1/I2/T3/100', 2, 1],
            [5,  0, -2, 1, 'G1/I2/T4', 1, 6],
            [6,  0, -1, 1, 'G1/I2/T4/100', 5, 2],
            [7,  0, -2, 1, 'G1/I2/T5', 1, 8],
            [8,  0, -1, 1, 'G1/I2/T5/102', 7, 3],
            [9,  0, -3, 4, 'G1/U2', 0, 10],
            [10, 0, -2, 2, 'G1/U2/T3', 9, 11],
            [11, 0, -1, 1, 'G1/U2/T3/101', 10, 4],
            [12, 0, -1, 1, 'G1/U2/T3/102', 10, 5],
            [13, 0, -2, 2, 'G1/U2/T4', 9, 14],
            [14, 0, -1, 1, 'G1/U2/T4/99', 13, 6],
            [15, 0, -1, 1, 'G1/U2/T4/100', 13, 7],
            [16, 0, -4, 8, 'G2', null, 17],
            [17, 0, -3, 2, 'G2/I2', 16, 18],
            [18, 0, -2, 2, 'G2/I2/T3', 17, 19],
            [19, 0, -1, 2, 'G2/I2/T3/100', 18, 8],
            [20, 0, -3, 4, 'G2/O2', 16, 21],
            [21, 0, -2, 4, 'G2/O2/T3', 20, 22],
            [22, 0, -1, 4, 'G2/O2/T3/100', 21, 10],
            [23, 0, -3, 2, 'G2/U2', 16, 24],
            [24, 0, -2, 2, 'G2/U2/T3', 23, 25],
            [25, 0, -1, 2, 'G2/U2/T3/100', 24, 14],
            [26, 0, -4, 8, 'G3', null, 27],
            [27, 0, -3, 2, 'G3/A2', 26, 28],
            [28, 0, -2, 2, 'G3/A2/T3', 27, 29],
            [29, 0, -1, 1, 'G3/A2/T3/95', 28, 16],
            [30, 0, -1, 1, 'G3/A2/T3/100', 28, 17],
            [31, 0, -3, 4, 'G3/E2', 26, 32],
            [32, 0, -2, 4, 'G3/E2/T3', 31, 33],
            [33, 0, -1, 1, 'G3/E2/T3/100', 32, 18],
            [34, 0, -1, 1, 'G3/E2/T3/101', 32, 19],
            [35, 0, -1, 1, 'G3/E2/T3/104', 32, 20],
            [36, 0, -1, 1, 'G3/E2/T3/110', 32, 21],
            [37, 0, -3, 1, 'G3/I2', 26, 38],
            [38, 0, -2, 1, 'G3/I2/T3', 37, 39],
            [39, 0, -1, 1, 'G3/I2/T3/94', 38, 22],
            [40, 0, -3, 1, 'G3/O2', 26, 41],
            [41, 0, -2, 1, 'G3/O2/T3', 40, 42],
            [42, 0, -1, 1, 'G3/O2/T3/100', 41, 23]
        ]);
    });

    test('preserves rowset filter when grouping is applied', () => {
        const rowSet = getTestRowset();
        rowSet.filter({ type: NOT_IN, colName: 'Group 3', values: ['T4'] });
        const groupRowSet = new GroupRowSet(rowSet, rowset_columns, [GROUP_COL_1]);
        let { rows } = groupRowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 5, 'G1'],
            [101, 0, -1, 8, 'G2'],
            [102, 0, -1, 8, 'G3']
        ]);

    });
});


describe('rowParents', () => {
    test('correctly constructed when grouped by a single column (applyGroupBy)', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        expect(rowSet.rowParents).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2])
    });

    test('correctly constructed when grouped by two columns (applyGroupBy)', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2])
        expect(rowSet.rowParents).toEqual([2, 2, 2, 2, 1, 1, 1, 1, 6, 6, 4, 4, 5, 5, 5, 5, 9, 9, 9, 9, 8, 8, 10, 11])
    });

    test('correctly rebuilt when groupBy set to new column (applyGroupBy)', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        rowSet.groupBy([GROUP_COL_2]);
        expect(rowSet.rowParents).toEqual([4, 4, 4, 4, 2, 2, 2, 2, 4, 4, 2, 2, 3, 3, 3, 3, 1, 1, 1, 1, 0, 0, 2, 3])

    });
    test('correctly rebuilt when column added to groupBy  (extendGroupBy)', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2]);
        expect(rowSet.rowParents).toEqual([2, 2, 2, 2, 1, 1, 1, 1, 6, 6, 4, 4, 5, 5, 5, 5, 9, 9, 9, 9, 8, 8, 10, 11])
    });
    test('correctly rebuilt when last column removed from groupBy  (reduceGroupBy)', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2])
        rowSet.groupBy([GROUP_COL_1]);
        expect(rowSet.rowParents).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2])
    });

    test('correctly rebuilt when first column removed from groupBy  (reduceGroupBy)', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2])
        rowSet.groupBy([GROUP_COL_2]);
        expect(rowSet.rowParents).toEqual([4, 4, 4, 4, 2, 2, 2, 2, 4, 4, 2, 2, 3, 3, 3, 3, 1, 1, 1, 1, 0, 0, 2, 3])
    });
  
    test('correctly rebuilt when middle column removed from three col groupBy  (reduceGroupBy)', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2,  GROUP_COL_3])
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_3]);
        expect(rowSet.rowParents).toEqual([1, 1, 2, 2, 1, 1, 2, 3, 5, 5, 5, 5, 5, 5, 5, 5, 7, 7, 7, 7, 7, 7, 7, 7])
    });

    test('inserted row correctly added to rowParents, single col grouping', () => {
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1]);
        table.insert(['key25', 'G1', 'I2', 'T5', 6, 112]);
        rowSet.insert(24, table.rows[24])
        expect(rowSet.rowParents).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 0])
    });

    test('inserted row correctly added to rowParents, two col grouping', () => {
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1,GROUP_COL_3]);
        table.insert(['key25', 'G1', 'I2', 'T5', 6, 112]);
        rowSet.insert(24, table.rows[24])
        expect(rowSet.rowParents).toEqual([1, 1, 2, 2, 1, 1, 2, 3, 5, 5, 5, 5, 5, 5, 5, 5, 7, 7, 7, 7, 7, 7, 7, 7, 3])
    });

})

describe('groupBy', () => {

    test('correctly adds additional column to groupby', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])

        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2]);
        const { groupRows, sortSet } = rowSet;
        const { rows } = rowSet.setRange({ lo: 0, hi: 4 });
        expect(groupRows.length).toBe(12);
        expect(groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -2, 8, 'G1', null, 1],
            [1, 0, -1, 4, 'G1/I2', 0, 0],
            [2, 0, -1, 4, 'G1/U2', 0, 4],
            [3, 0, -2, 8, 'G2', null, 4],
            [4, 0, -1, 2, 'G2/I2', 3, 8],
            [5, 0, -1, 4, 'G2/O2', 3, 10],
            [6, 0, -1, 2, 'G2/U2', 3, 14],
            [7, 0, -2, 8, 'G3', null, 8],
            [8, 0, -1, 2, 'G3/A2', 7, 16],
            [9, 0, -1, 4, 'G3/E2', 7, 18],
            [10,0, -1, 1, 'G3/I2', 7, 22],
            [11,0, -1, 1, 'G3/O2', 7, 23]
        ]);
        expect(sortSet).toEqual([4, 5, 6, 7, 0, 1, 2, 3, 10, 11, 12, 13, 14, 15, 8, 9, 20, 21, 16, 17, 18, 19, 22, 23]);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -2, 8, 'G1'],
            [101, 0, -2, 8, 'G2'],
            [102, 0, -2, 8, 'G3']
        ]);
    });

    test('repeatedly adds additional column to groupby', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2])
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2, GROUP_COL_3])
        const { rows } = rowSet.setRange({ lo: 0, hi: 4 });
        const { groupRows } = rowSet;
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -3, 8, 'G1'],
            [101, 0, -3, 8, 'G2'],
            [102, 0, -3, 8, 'G3']
        ]);

        expect(groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0,  0, -3, 8, 'G1', null, 1],
            [1,  0, -2, 4, 'G1/I2', 0, 2],
            [2,  0, -1, 2, 'G1/I2/T3', 1, 0],
            [3,  0, -1, 1, 'G1/I2/T4', 1, 2],
            [4,  0, -1, 1, 'G1/I2/T5', 1, 3],
            [5,  0, -2, 4, 'G1/U2', 0, 6],
            [6,  0, -1, 2, 'G1/U2/T3', 5, 4],
            [7,  0, -1, 2, 'G1/U2/T4', 5, 6],
            [8,  0, -3, 8, 'G2', null, 9],
            [9,  0, -2, 2, 'G2/I2', 8, 10],
            [10, 0, -1, 2, 'G2/I2/T3', 9, 8],
            [11, 0, -2, 4, 'G2/O2', 8, 12],
            [12, 0, -1, 4, 'G2/O2/T3', 11, 10],
            [13, 0, -2, 2, 'G2/U2', 8, 14],
            [14, 0, -1, 2, 'G2/U2/T3', 13, 14],
            [15, 0, -3, 8, 'G3', null, 16],
            [16, 0, -2, 2, 'G3/A2', 15, 17],
            [17, 0, -1, 2, 'G3/A2/T3', 16, 16],
            [18, 0, -2, 4, 'G3/E2', 15, 19],
            [19, 0, -1, 4, 'G3/E2/T3', 18, 18],
            [20, 0, -2, 1, 'G3/I2', 15, 21],
            [21, 0, -1, 1, 'G3/I2/T3', 20, 22],
            [22, 0, -2, 1, 'G3/O2', 15, 23],
            [23, 0, -1, 1, 'G3/O2/T3', 22, 23]
        ])
    });

    test('extends grouping across expanded nodes', () => {
        const { DEPTH } = metaData(rowset_columns)
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2])
        rowSet.setGroupState({ 'G1': true })
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2, GROUP_COL_3])
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        expect(rowSet.length).toBe(5);
        expect(rowSet.groupRows.length).toBe(24);
        expect(rowSet.groupRows[0][DEPTH]).toBe(3);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, 3, 8, 'G1'],
            [101, 0, -2, 4, 'G1/I2'],
            [102, 0, -2, 4, 'G1/U2'],
            [103, 0, -3, 8, 'G2'],
            [104, 0, -3, 8, 'G3']
        ]);

    });

    test('extends grouping across expanded leaf nodes', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        rowSet.setGroupState({ 'G1': true })
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_3])
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });

        expect(rowSet.length).toBe(6);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +2, 8, 'G1'],
            [101, 0, -1, 4, 'G1/T3'],
            [102, 0, -1, 3, 'G1/T4'],
            [103, 0, -1, 1, 'G1/T5'],
            [104, 0, -2, 8, 'G2'],
            [105, 0, -2, 8, 'G3']
        ]);
    });

    test('extends grouping across expanded leaf nodes, including last leaf node', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        rowSet.setGroupState({ 'G1': true, 'G3': true })
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_3])
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        expect(rowSet.length).toBe(7);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +2, 8, 'G1'],
            [101, 0, -1, 4, 'G1/T3'],
            [102, 0, -1, 3, 'G1/T4'],
            [103, 0, -1, 1, 'G1/T5'],
            [104, 0, -2, 8, 'G2'],
            [105, 0, +2, 8, 'G3'],
            [106, 0, -1, 8, 'G3/T3']
        ]);
    });

    test('adds additional column to multi-column groupby, multiple nodes expanded', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2])
        rowSet.setGroupState({ 'G1': true, 'G2': true, 'G3': true });
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2, GROUP_COL_3])
        const { rows } = rowSet.setRange({ lo: 0, hi: 15 });
        expect(rowSet.length).toBe(12);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, 3, 8, 'G1'],
            [101, 0, -2, 4, 'G1/I2'],
            [102, 0, -2, 4, 'G1/U2'],
            [103, 0, 3, 8, 'G2'],
            [104, 0, -2, 2, 'G2/I2'],
            [105, 0, -2, 4, 'G2/O2'],
            [106, 0, -2, 2, 'G2/U2'],
            [107, 0, 3, 8, 'G3'],
            [108, 0, -2, 2, 'G3/A2'],
            [109, 0, -2, 4, 'G3/E2'],
            [110, 0, -2, 1, 'G3/I2'],
            [111, 0, -2, 1, 'G3/O2']
        ]);
    });

    test('regroup using a different column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1])
        rowSet.groupBy([GROUP_COL_2]);
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        expect(rowSet.length).toBe(5);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 2, 'A2'],
            [101, 0, -1, 4, 'E2'],
            [102, 0, -1, 7, 'I2'],
            [103, 0, -1, 5, 'O2'],
            [104, 0, -1, 6, 'U2']
        ]);
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -1, 2, 'A2', null, 0],
            [1, 0, -1, 4, 'E2', null, 2],
            [2, 0, -1, 7, 'I2', null, 6],
            [3, 0, -1, 5, 'O2', null, 13],
            [4, 0, -1, 6, 'U2', null, 18]
        ]);
        expect(rowSet.sortSet).toEqual([20, 21, 16, 17, 18, 19, 4, 5, 6, 7, 10, 11, 22, 12, 13, 14, 15, 23, 0, 1, 2, 3, 8, 9]);
    });

    test('remove a column from the middle of groupby', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_3])
        // console.log(`${join(rowSet.groupRows)} ${join(rowSet.data)} ${join(results)}`);
        // console.log(rowSet.sortSet)
        expect(rowSet.length).toBe(3)
        expect(rowSet.groupRows.length).toBe(8)
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -2, 8, 'G1', null, 1],
            [1, 0, -1, 4, 'G1/T3', 0, 0],
            [2, 0, -1, 3, 'G1/T4', 0, 4],
            [3, 0, -1, 1, 'G1/T5', 0, 7],
            [4, 0, -2, 8, 'G2', null, 5],
            [5, 0, -1, 8, 'G2/T3', 4, 8],
            [6, 0, -2, 8, 'G3', null, 7],
            [7, 0, -1, 8, 'G3/T3', 6, 16]
        ]);
    });

    test('remove the last column from groupby', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -2, 8, 'G1', null, 1],
            [1, 0, -1, 4, 'G1/I2', 0, 0],
            [2, 0, -1, 4, 'G1/U2', 0, 4],
            [3, 0, -2, 8, 'G2', null, 4],
            [4, 0, -1, 2, 'G2/I2', 3, 8],
            [5, 0, -1, 4, 'G2/O2', 3, 10],
            [6, 0, -1, 2, 'G2/U2', 3, 14],
            [7, 0, -2, 8, 'G3', null, 8],
            [8, 0, -1, 2, 'G3/A2', 7, 16],
            [9, 0, -1, 4, 'G3/E2', 7, 18],
            [10,0, -1, 1, 'G3/I2', 7, 22],
            [11,0, -1, 1, 'G3/O2', 7, 23]
        ]);
    });

    test('remove the last column from groupby, root nodes expanded', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.setGroupState({ G1: true });
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2]);
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, +2, 8, 'G1', null, 1],
            [1, 0, -1, 4, 'G1/I2', 0, 0],
            [2, 0, -1, 4, 'G1/U2', 0, 4],
            [3, 0, -2, 8, 'G2', null, 4],
            [4, 0, -1, 2, 'G2/I2', 3, 8],
            [5, 0, -1, 4, 'G2/O2', 3, 10],
            [6, 0, -1, 2, 'G2/U2', 3, 14],
            [7, 0, -2, 8, 'G3', null, 8],
            [8, 0, -1, 2, 'G3/A2', 7, 16],
            [9, 0, -1, 4, 'G3/E2', 7, 18],
            [10,0, -1, 1, 'G3/I2', 7, 22],
            [11,0, -1, 1, 'G3/O2', 7, 23]
        ]);
    });

    test('remove a column from the middle of groupby, root nodes expanded', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.setGroupState({ 'G1': true, 'G2': true, 'G3': true })
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_3])
        expect(rowSet.length).toBe(8);

    });

    test('reverse direction on a group column - single column grouping', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.groupBy([['Group 1', 'dsc']])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -1, 8, 'G3', null, 16],
            [1, 0, -1, 8, 'G2', null, 8],
            [2, 0, -1, 8, 'G1', null, 0]
        ]);
    });

    test('reverse direction on first group column of two column grouping', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.groupBy([['Group 1', 'dsc'], GROUP_COL_2])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -2, 8, 'G3', null, 1],
            [1, 0, -1, 2, 'G3/A2', 0, 16],
            [2, 0, -1, 4, 'G3/E2', 0, 18],
            [3, 0, -1, 1, 'G3/I2', 0, 22],
            [4, 0, -1, 1, 'G3/O2', 0, 23],
            [5, 0, -2, 8, 'G2', null, 6],
            [6, 0, -1, 2, 'G2/I2', 5, 8],
            [7, 0, -1, 4, 'G2/O2', 5, 10],
            [8, 0, -1, 2, 'G2/U2', 5, 14],
            [9, 0, -2, 8, 'G1', null, 10],
            [10,0, -1, 4, 'G1/I2', 9, 0],
            [11,0, -1, 4, 'G1/U2', 9, 4]
        ]);
    });

    test('reverse direction on first group column of two column grouping, then reverse back', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.groupBy([['Group 1', 'dsc'], GROUP_COL_2])
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -2, 8, 'G1', null, 1],
            [1, 0, -1, 4, 'G1/I2', 0, 0],
            [2, 0, -1, 4, 'G1/U2', 0, 4],
            [3, 0, -2, 8, 'G2', null, 4],
            [4, 0, -1, 2, 'G2/I2', 3, 8],
            [5, 0, -1, 4, 'G2/O2', 3, 10],
            [6, 0, -1, 2, 'G2/U2', 3, 14],
            [7, 0, -2, 8, 'G3', null, 8],
            [8, 0, -1, 2, 'G3/A2', 7, 16],
            [9, 0, -1, 4, 'G3/E2', 7, 18],
            [10,0, -1, 1, 'G3/I2', 7, 22],
            [11,0, -1, 1, 'G3/O2', 7, 23]
        ]);
    })

    test('reverse direction on a group column - single column grouping, with expanded row', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true })
        rowSet.groupBy([['Group 1', 'dsc']])
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });

        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 8, 'G3'],
            [101, 0, -1, 8, 'G2'],
            [102, 0, 1, 8, 'G1'],
            [103, 0, 0, 0, 'key01'],
            [104, 0, 0, 0, 'key02'],
            [105, 0, 0, 0, 'key03'],
            [106, 0, 0, 0, 'key04'],
            [107, 0, 0, 0, 'key05'],
            [108, 0, 0, 0, 'key06'],
            [109, 0, 0, 0, 'key07']
        ]);
        expect(rowSet.length).toBe(11);
    });

    test('reverse direction on a group column - multi column grouping, reverse middle column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.groupBy([GROUP_COL_1, ['Group 2', 'dsc'], GROUP_COL_3])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -3, 8, 'G1', null, 1],
            [1, 0, -2, 4, 'G1/U2', 0, 2],
            [2, 0, -1, 2, 'G1/U2/T3', 1, 4],
            [3, 0, -1, 2, 'G1/U2/T4', 1, 6],
            [4, 0, -2, 4, 'G1/I2', 0, 5],
            [5, 0, -1, 2, 'G1/I2/T3', 4, 0],
            [6, 0, -1, 1, 'G1/I2/T4', 4, 2],
            [7, 0, -1, 1, 'G1/I2/T5', 4, 3],
            [8, 0, -3, 8, 'G2', null, 9],
            [9, 0, -2, 2, 'G2/U2', 8, 10],
            [10,0, -1, 2, 'G2/U2/T3', 9, 14],
            [11,0, -2, 4, 'G2/O2', 8, 12],
            [12,0, -1, 4, 'G2/O2/T3', 11, 10],
            [13,0, -2, 2, 'G2/I2', 8, 14],
            [14,0, -1, 2, 'G2/I2/T3', 13, 8],
            [15,0, -3, 8, 'G3', null, 16],
            [16,0, -2, 1, 'G3/O2', 15, 17],
            [17,0, -1, 1, 'G3/O2/T3', 16, 23],
            [18,0, -2, 1, 'G3/I2', 15, 19],
            [19,0, -1, 1, 'G3/I2/T3', 18, 22],
            [20,0, -2, 4, 'G3/E2', 15, 21],
            [21,0, -1, 4, 'G3/E2/T3', 20, 18],
            [22,0, -2, 2, 'G3/A2', 15, 23],
            [23,0, -1, 2, 'G3/A2/T3', 22, 16]
        ]);

    });

    test('reverse direction on a group column - multi column grouping, reverse middle column, multiple expanded nodes', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.setGroupState({ 'G1': true, 'G2': true, 'G3': { 'E2': true } })
        rowSet.groupBy([GROUP_COL_1, ['Group 2', 'dsc'], GROUP_COL_3]);
        const { rows } = rowSet.setRange({ lo: 0, hi: 15 });
        expect(rowSet.groupRows.length).toBe(24);
        // check the IDX_POINTER from groupedRows to sorted visibleRows
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, 3, 8, 'G1'],
            [101, 0, -2, 4, 'G1/U2'],
            [102, 0, -2, 4, 'G1/I2'],
            [103, 0, 3, 8, 'G2'],
            [104, 0, -2, 2, 'G2/U2'],
            [105, 0, -2, 4, 'G2/O2'],
            [106, 0, -2, 2, 'G2/I2'],
            [107, 0, 3, 8, 'G3'],
            [108, 0, -2, 1, 'G3/O2'],
            [109, 0, -2, 1, 'G3/I2'],
            [110, 0, 2, 4, 'G3/E2'],
            [111, 0, -1, 4, 'G3/E2/T3'],
            [112, 0, -2, 2, 'G3/A2']
        ])
    });

    test('filter by col 2 of a two col grouping', () => {
        const N = null;
        const U = undefined;
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2])
        rowSet.filter({ type: 'GT', colName: 'Qty', value: 100 });
        let { rows } = rowSet.setRange({ lo: 0, hi: 15 });

        expect(rowSet.groupRows).toEqual([
            [N, 'G1',  N,   N, N, N, 0,  0, -2, 8, 'G1', 0, N, 1, 3, U],
            [N, 'G1', 'I2', N, N, N, 1,  0, -1, 4, 'G1/I2', 0, 0, 0, 1, 0],
            [N, 'G1', 'U2', N, N, N, 2,  0, -1, 4, 'G1/U2', 0, 0, 4, 2, 1],
            [N, 'G2',  N,   N, N, N, 3,  0, -2, 8, 'G2', 0, N, 4, 0, U],
            [N, 'G2', 'I2', N, N, N, 4,  0, -1, 2, 'G2/I2', 0, 3, 8, 0, U],
            [N, 'G2', 'O2', N, N, N, 5,  0, -1, 4, 'G2/O2', 0, 3, 10, 0, U],
            [N, 'G2', 'U2', N, N, N, 6,  0, -1, 2, 'G2/U2', 0, 3, 14, 0, U],
            [N, 'G3',  N,   N, N, N, 7,  0, -2, 8, 'G3', 0, N, 8, 3, U],
            [N, 'G3', 'A2', N, N, N, 8,  0, -1, 2, 'G3/A2', 0, 7, 16, 0, U],
            [N, 'G3', 'E2', N, N, N, 9,  0, -1, 4, 'G3/E2', 0, 7, 18, 3, 3],
            [N, 'G3', 'I2', N, N, N, 10, 0,  -1, 1, 'G3/I2', 0, 7, 22, 0, U],
            [N, 'G3', 'O2', N, N, N, 11, 0,  -1, 1, 'G3/O2', 0, 7, 23, 0, U]
        ]);

        expect(rows).toEqual([
            [N, 'G1', N, N, N, N, 100, 0, -2, 3, 'G1', 0, N, 1, 3, U],
            [N, 'G3', N, N, N, N, 101, 0, -2, 3, 'G3', 0, N, 8, 3, U]
        ]);

        rowSet.setGroupState({ 'G1': true });
        ({ rows } = rowSet.setRange({ lo: 0, hi: 15 }, false));
        expect(rows).toEqual([
            [N, 'G1',  N,   N, N, N, 100, 0, 2, 3, 'G1', 0, N, 1, 3, U],
            [N, 'G1', 'I2', N, N, N, 101, 0, -1, 1, 'G1/I2', 0, 0, 0, 1, 0],
            [N, 'G1', 'U2', N, N, N, 102, 0, -1, 2, 'G1/U2', 0, 0, 4, 2, 1],
            [N, 'G3',  N,   N, N, N, 103, 0, -2, 3, 'G3', 0, N, 8, 3, U]
        ]);

        rowSet.setGroupState({ 'G1': { I2: true } });
        ({ rows } = rowSet.setRange({ lo: 0, hi: 15 }, false));
        expect(rows).toEqual([
            [ N,      'G1',  N,    N,   N, N,   100, 0,  2, 3, 'G1', 0, N, 1, 3, U],
            [ N,      'G1', 'I2',  N,   N, N,   101, 0,  1, 1, 'G1/I2', 0, 0, 0, 1, 0],
            ['key08', 'G1', 'I2', 'T5', 5, 102, 102, 0,  0, 0, 'key08'],
            [ N,      'G1', 'U2',  N,   N, N,   103, 0, -1, 2, 'G1/U2', 0, 0, 4, 2, 1],
            [ N,      'G3',  N,    N,   N, N,   104, 0, -2, 3, 'G3', 0, N, 8, 3, U]
        ]);

    });

    test('group by col1, filter by col2, then add col 2 to groupby', () => {
        const N = null;
        const U = undefined;
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({ type: 'GT', colName: 'Qty', value: 100 });
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2]);
        expect(rowSet.groupRows).toEqual([
            [N, 'G1',  N,   N, N, N, 0,  0, -2, 8, 'G1', 0, N, 1, 3, U],
            [N, 'G1', 'I2', N, N, N, 1,  0, -1, 4, 'G1/I2', 0, 0, 0, 1, 0],
            [N, 'G1', 'U2', N, N, N, 2,  0, -1, 4, 'G1/U2', 0, 0, 4, 2, 1],
            [N, 'G2',  N,   N, N, N, 3,  0, -2, 8, 'G2', 0, N, 4, 0, U],
            [N, 'G2', 'I2', N, N, N, 4,  0, -1, 2, 'G2/I2', 0, 3, 8, 0, U],
            [N, 'G2', 'O2', N, N, N, 5,  0, -1, 4, 'G2/O2', 0, 3, 10, 0, U],
            [N, 'G2', 'U2', N, N, N, 6,  0, -1, 2, 'G2/U2', 0, 3, 14, 0, U],
            [N, 'G3',  N,   N, N, N, 7,  0, -2, 8, 'G3', 0, N, 8, 3, U],
            [N, 'G3', 'A2', N, N, N, 8,  0, -1, 2, 'G3/A2', 0, 7, 16, 0, U],
            [N, 'G3', 'E2', N, N, N, 9,  0, -1, 4, 'G3/E2', 0, 7, 18, 3, 3],
            [N, 'G3', 'I2', N, N, N, 10, 0, -1, 1, 'G3/I2', 0, 7, 22, 0, U],
            [N, 'G3', 'O2', N, N, N, 11, 0, -1, 1, 'G3/O2', 0, 7, 23, 0, U]
        ]);
        let { rows } = rowSet.setRange({ lo: 0, hi: 15 }, false);
        expect(rows).toEqual([
            [N, 'G1', N, N, N, N, 100, 0, -2, 3, 'G1', 0, N, 1, 3, U],
            [N, 'G3', N, N, N, N, 101, 0, -2, 3, 'G3', 0, N, 8, 3, U]
        ]);

        rowSet.setGroupState({ G1: true });
        ({ rows } = rowSet.setRange({ lo: 0, hi: 15 }, false));
        expect(rows).toEqual([
            [N, 'G1',  N,   N, N, N, 100, 0, +2, 3, 'G1', 0, N, 1, 3, U],
            [N, 'G1', 'I2', N, N, N, 101, 0, -1, 1, 'G1/I2', 0, 0, 0, 1, 0],
            [N, 'G1', 'U2', N, N, N, 102, 0, -1, 2, 'G1/U2', 0, 0, 4, 2, 1],
            [N, 'G3',  N,   N, N, N, 103, 0, -2, 3, 'G3', 0, N, 8, 3, U]
        ]);

        rowSet.setGroupState({ G1: { I2: true, U2: true } });
        ({ rows } = rowSet.setRange({ lo: 0, hi: 15 }, false));
        expect(rows).toEqual([
            [ N,      'G1',  N,    N,   N, N,   100, 0, +2, 3, 'G1', 0, N, 1, 3, U],
            [ N,      'G1', 'I2',  N,   N, N,   101, 0, +1, 1, 'G1/I2', 0, 0, 0, 1, 0],
            ['key08', 'G1', 'I2', 'T5', 5, 102, 102, 0,  0, 0, 'key08'],
            [ N,      'G1', 'U2',  N,   N, N,   103, 0, +1, 2, 'G1/U2', 0, 0, 4, 2, 1],
            ['key01', 'G1', 'U2', 'T3', 5, 101, 104, 0,  0, 0, 'key01'],
            ['key02', 'G1', 'U2', 'T3', 5, 102, 105, 0,  0, 0, 'key02'],
            [ N,      'G3',  N,    N,   N, N,   106, 0, -2, 3, 'G3', 0, N, 8, 3, U]
        ]);

    })

    test('group by col1, filter by col2, then add col 2 to groupby, remove col2 from groupby, expand group', () => {
        const N = null;
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({ type: 'GT', colName: 'Qty', value: 100 });
        rowSet.groupBy([GROUP_COL_1, GROUP_COL_2]);
        rowSet.groupBy([GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true });
        let { rows } = rowSet.setRange({ lo: 0, hi: 10 }, false);
        expect(rows.map(row => row.slice(0, 11))).toEqual([
            [ N,      'G1',  N,    N,   N, N,   100, 0, +1, 3, 'G1'],
            ['key08', 'G1', 'I2', 'T5', 5, 102, 101, 0,  0, 0, 'key08'],
            ['key01', 'G1', 'U2', 'T3', 5, 101, 102, 0,  0, 0, 'key01'],
            ['key02', 'G1', 'U2', 'T3', 5, 102, 103, 0,  0, 0, 'key02'],
            [ N,      'G3',  N,    N,   N, N,   104, 0, -1, 3, 'G3']
        ]);
    })
});

describe('setGroupState', () => {

    test('correctly expands a node, single level grouping', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true })
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        // TODO is this right ? should the leaf rows have unique id in pos 4 ?
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, 1, 8, 'G1'],
            [101, 0, 0, 0, 'key01'],
            [102, 0, 0, 0, 'key02'],
            [103, 0, 0, 0, 'key03'],
            [104, 0, 0, 0, 'key04'],
            [105, 0, 0, 0, 'key05'],
            [106, 0, 0, 0, 'key06'],
            [107, 0, 0, 0, 'key07']
        ]);
        expect(rowSet.length).toBe(11)
    });

    test('correctly expands a node, top-level of two level grouping', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setGroupState({ 'G1': true })
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        // console.log(`${join(rowSet.groupRows)} ${join(rowSet.data)} ${join(results)}`);
        // console.log(rowSet.sortSet)
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0,  2, 8, 'G1'],
            [101, 0, -1, 4, 'G1/I2'],
            [102, 0, -1, 4, 'G1/U2'],
            [103, 0, -2, 8, 'G2'],
            [104, 0, -2, 8, 'G3']
        ]);
        expect(rowSet.length).toBe(5)
    });

    test('correctly expands nodes at successive levels', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setGroupState({ 'G1': true })
        rowSet.setGroupState({ 'G1': { U2: true } })
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0,  2, 8, 'G1'],
            [101, 0, -1, 4, 'G1/I2'],
            [102, 0,  1, 4, 'G1/U2'],
            [103, 0,  0, 0, 'key01'],
            [104, 0,  0, 0, 'key02'],
            [105, 0,  0, 0, 'key03'],
            [106, 0,  0, 0, 'key04'],
            [107, 0, -2, 8, 'G2']
        ]);
        expect(rowSet.length).toBe(9)
    });

    test('correctly expands multiple nodes together', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setGroupState({ 'G1': { U2: true } })
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0,  2, 8, 'G1'],
            [101, 0, -1, 4, 'G1/I2'],
            [102, 0,  1, 4, 'G1/U2'],
            [103, 0,  0, 0, 'key01'],
            [104, 0,  0, 0, 'key02'],
            [105, 0,  0, 0, 'key03'],
            [106, 0,  0, 0, 'key04'],
            [107, 0, -2, 8, 'G2']
        ]);
        expect(rowSet.length).toBe(9)
    });

    test('collapsing an expanded node collpases any expanded children', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setGroupState({ 'G1': true })
        rowSet.setGroupState({ 'G1': { U2: true } })
        rowSet.setGroupState({ 'G1': false })
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -2, 8, 'G1'],
            [101, 0, -2, 8, 'G2'],
            [102, 0, -2, 8, 'G3']
        ]);
        expect(rowSet.length).toBe(3)
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0,  0, -2, 8, 'G1', null, 1],
            [1,  0, -1, 4, 'G1/I2', 0, 0],
            [2,  0, -1, 4, 'G1/U2', 0, 4],
            [3,  0, -2, 8, 'G2', null, 4],
            [4,  0, -1, 2, 'G2/I2', 3, 8],
            [5,  0, -1, 4, 'G2/O2', 3, 10],
            [6,  0, -1, 2, 'G2/U2', 3, 14],
            [7,  0, -2, 8, 'G3', null, 8],
            [8,  0, -1, 2, 'G3/A2', 7, 16],
            [9,  0, -1, 4, 'G3/E2', 7, 18],
            [10, 0,  -1, 1, 'G3/I2', 7, 22],
            [11, 0,  -1, 1, 'G3/O2', 7, 23]
        ]);
    });

    test('expanding a node does not affect group column ordering, last node expanded, top col reversed', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.groupBy([['Group 1', 'dsc'], GROUP_COL_2])
        rowSet.setGroupState({ 'G1': true })
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });

        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -2, 8, 'G3'],
            [101, 0, -2, 8, 'G2'],
            [102, 0, +2, 8, 'G1'],
            [103, 0, -1, 4, 'G1/I2'],
            [104, 0, -1, 4, 'G1/U2']
        ])
    });
    
      test('expanding a node does not affect group column ordering, first node expanded, top col reversed', () => {
        const groupRowset = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        groupRowset.groupBy([['Group 1','dsc'],['Group 2', 'asc']])
        groupRowset.setGroupState({'G3':true})
        const { rows } = groupRowset.setRange({ lo: 0, hi: 10 });

        expect(rows.map(d => d.slice(6, 11))).toEqual([
          [ 100, 0, +2, 8, 'G3'],
          [ 101, 0, -1, 2, 'G3/A2'],
          [ 102, 0, -1, 4, 'G3/E2'],
          [ 103, 0, -1, 1, 'G3/I2'],
          [ 104, 0, -1, 1, 'G3/O2'],
          [ 105, 0, -2, 8, 'G2'],
          [ 106, 0, -2, 8, 'G1']
        ])
        
      });
    
      test('collapsing a node does not affect group column ordering, last node expanded, top col reversed', () => {
        const groupRowset = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        groupRowset.groupBy([['Group 1','dsc'],['Group 2', 'asc']])
        groupRowset.setGroupState({'G1':true})
        groupRowset.setGroupState({})
        const { rows } = groupRowset.setRange({ lo: 0, hi: 10 });
        
        expect(rows.map(d => d.slice(6, 11))).toEqual([
          [ 100, 0, -2, 8, 'G3'],
          [ 101, 0, -2, 8, 'G2'],
          [ 102, 0, -2, 8, 'G1']
        ])
        
      });
    
      test('collapsing a node does not affect group column ordering, first node expanded, top col reversed', () => {
        const groupRowset = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        groupRowset.groupBy([['Group 1','dsc'],['Group 2', 'asc']])
        groupRowset.setGroupState({'G3':true})
        groupRowset.setGroupState({})
        const { rows } = groupRowset.setRange({ lo: 0, hi: 10 });
        
        expect(rows.map(d => d.slice(6, 11))).toEqual([
          [ 100, 0, -2, 8, 'G3'],
          [ 101, 0, -2, 8, 'G2'],
          [ 102, 0, -2, 8, 'G1']
        ])
        
      });
    
});

describe('toggleAll', () => {
    test('single col grouping, expand all', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.toggleAll(true);
        const {DEPTH} = rowSet.meta;
        let depth = rowSet.groupRows.map(row => row[DEPTH]);
        expect(depth).toEqual([1,1,1])

        rowSet.toggleAll(false);
        depth = rowSet.groupRows.map(row => row[DEPTH]);
        expect(depth).toEqual([-1,-1,-1])

    })

    test('two col grouping, expand all', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.toggleAll(true);
        const {DEPTH} = rowSet.meta;
        let depth = rowSet.groupRows.map(row => row[DEPTH]);
        expect(depth).toEqual([2,1,1,2,1,1,1,2,1,1,1,1]);

        rowSet.toggleAll(false);
        depth = rowSet.groupRows.map(row => row[DEPTH]);
        expect(depth).toEqual([-2,-1,-1,-2,-1,-1,-1,-2,-1,-1,-1,-1]);

    });
})

describe('sort', () => {
    test('sort on non-groupby column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_3]);
        rowSet.setGroupState({ 'G3': { 'T3': true } });
        rowSet.sort([['Qty', 'asc']]);
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -2, 8, 'G1'],
            [101, 0, -2, 8, 'G2'],
            [102, 0, 2, 8, 'G3'],
            [103, 0, 1, 8, 'G3/T3'],
            [104, 0, 0, 0, 'key23'],
            [105, 0, 0, 0, 'key22'],
            [106, 0, 0, 0, 'key19'],
            [107, 0, 0, 0, 'key21'],
            [108, 0, 0, 0, 'key24'],
            [109, 0, 0, 0, 'key18']
        ]);

    });
})


describe('filter', () => {

    test('filter that removes all leaves for group removes visible group', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({ type: NOT_IN, colName: 'Qty', values: [100] }, true);
        const { rows } = rowSet.setRange({ lo: 0, hi: 8 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 5, 'G1'],
            [101, 0, -1, 5, 'G3']
        ]);
    });

    test('filter over expanded group nodes does not break structure', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true })
        rowSet.filter({ type: NOT_IN, colName: 'Qty', values: [100] }, true);
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rowSet.length).toBe(7)
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, 1, 5, 'G1'],
            [101, 0, 0, 0, 'key01'],
            [102, 0, 0, 0, 'key02'],
            [103, 0, 0, 0, 'key04'],
            [104, 0, 0, 0, 'key06'],
            [105, 0, 0, 0, 'key08'],
            [106, 0, -1, 5, 'G3']
        ]);
    });

    test('null filter restores all data', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({ type: NOT_IN, colName: 'Qty', values: [100] });
        rowSet.clearFilter();
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 8, 'G1'],
            [101, 0, -1, 8, 'G2'],
            [102, 0, -1, 8, 'G3']
        ]);

    });

    test('filters can be composed', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({
            type: 'AND', filters: [
                { type: 'EQ', colName: 'Group 3', value: 'T3' },
                { type: NOT_IN, colName: 'Qty', values: [102] }
            ]
        });
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 3, 'G1'],
            [101, 0, -1, 8, 'G2'],
            [102, 0, -1, 8, 'G3']
        ]);

    });

    test('filters can be incrememtally added to', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({ type: 'EQ', colName: 'Group 3', value: 'T3' }, true);
        rowSet.filter({
            type: 'AND', filters: [
                { type: 'EQ', colName: 'Group 3', value: 'T3' },
                { type: NOT_IN, colName: 'Qty', values: [102] }
            ]
        });
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 3, 'G1'],
            [101, 0, -1, 8, 'G2'],
            [102, 0, -1, 8, 'G3']
        ]);
    });

    test('filter removes exposed leaf rows', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true });
        rowSet.filter({ type: 'EQ', colName: 'Group 3', value: 'T3' });
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +1, 4, 'G1'],
            [101, 0,  0, 0, 'key01'],
            [102, 0,  0, 0, 'key02'],
            [103, 0,  0, 0, 'key05'],
            [104, 0,  0, 0, 'key06'],
            [105, 0, -1, 8, 'G2'],
            [106, 0, -1, 8, 'G3']
        ]);
    });

    test('removing filter restores hidden leaf rows', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true });
        rowSet.filter({ type: 'EQ', colName: 'Group 3', value: 'T3' }, true);
        rowSet.clearFilter();
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +1, 8, 'G1'],
            [101, 0,  0, 0, 'key01'],
            [102, 0,  0, 0, 'key02'],
            [103, 0,  0, 0, 'key03'],
            [104, 0,  0, 0, 'key04'],
            [105, 0,  0, 0, 'key05'],
            [106, 0,  0, 0, 'key06'],
            [107, 0,  0, 0, 'key07'],
            [108, 0,  0, 0, 'key08'],
            [109, 0, -1, 8, 'G2']
        ]);

    });

    test('filters update visible group counts at all group levels', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.setGroupState({ 'G1': true });
        rowSet.filter({ type: 'EQ', colName: 'Group 3', value: 'T3' }, true);
        const { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 15)))).toEqual([
            [0,  0, +3, 8, 'G1', null, 1, 4],
            [1,  0, -2, 4, 'G1/I2', 0, 2, 2],
            [2,  0, -1, 2, 'G1/I2/T3', 1, 0, 2],
            [3,  0, -1, 1, 'G1/I2/T4', 1, 2, 0],
            [4,  0, -1, 1, 'G1/I2/T5', 1, 3, 0],
            [5,  0, -2, 4, 'G1/U2', 0, 6, 2],
            [6,  0, -1, 2, 'G1/U2/T3', 5, 4, 2],
            [7,  0, -1, 2, 'G1/U2/T4', 5, 6, 0],
            [8,  0, -3, 8, 'G2', null, 9, 8],
            [9,  0, -2, 2, 'G2/I2', 8, 10, 2],
            [10, 0, -1, 2, 'G2/I2/T3', 9, 8, 2],
            [11, 0, -2, 4, 'G2/O2', 8, 12, 4],
            [12, 0, -1, 4, 'G2/O2/T3', 11, 10, 4],
            [13, 0, -2, 2, 'G2/U2', 8, 14, 2],
            [14, 0, -1, 2, 'G2/U2/T3', 13, 14, 2],
            [15, 0, -3, 8, 'G3', null, 16, 8],
            [16, 0, -2, 2, 'G3/A2', 15, 17, 2],
            [17, 0, -1, 2, 'G3/A2/T3', 16, 16, 2],
            [18, 0, -2, 4, 'G3/E2', 15, 19, 4],
            [19, 0, -1, 4, 'G3/E2/T3', 18, 18, 4],
            [20, 0, -2, 1, 'G3/I2', 15, 21, 1],
            [21, 0, -1, 1, 'G3/I2/T3', 20, 22, 1],
            [22, 0, -2, 1, 'G3/O2', 15, 23, 1],
            [23, 0, -1, 1, 'G3/O2/T3', 22, 23, 1]
        ]);

        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +3, 4, 'G1'],
            [101, 0, -2, 2, 'G1/I2'],
            [102, 0, -2, 2, 'G1/U2'],
            [103, 0, -3, 8, 'G2'],
            [104, 0, -3, 8, 'G3']
        ]);
    });

    test('filter forces recalculation of aggregations', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns_with_aggregation, [GROUP_COL_1]);
        rowSet.filter({ type: 'EQ', colName: 'Group 3', value: 'T3' });
        expect(rowSet.groupRows[0][4]).toBe(6); // Price
        expect(rowSet.groupRows[0][5]).toBe(348); // Qty
    });

    test('filter forces recalculation of aggregations, through full group hierarchy', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns_with_aggregation, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.filter({ type: 'EQ', colName: 'Group 3', value: 'T3' });
        expect(rowSet.groupRows[0][4]).toBe(6)
        expect(rowSet.groupRows[0][5]).toBe(348)
    });

    test('filter by grouped col, progressively extending filter. Aggregations should be updated correctly', () => {
        const N = null;
        const U = undefined;
        const rowSet = new GroupRowSet(getInstrumentRowset(), instrumentColumns, [
            ['Sector', 'asc'], ['Industry', 'asc']]);
        rowSet.filter({ colName: 'Sector', type: IN, values: [] });
        let { rows, size } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(size).toBe(0);
        rowSet.filter({ colName: 'Sector', type: IN, values: ['Basic Industries'] });
        ({ rows, size } = rowSet.setRange({ lo: 0, hi: 10 }));
        expect(size).toBe(1);
        expect(rows[0]).toEqual([N, N, 22.48922592592592, 30965590000, N, 'Basic Industries', N, 100, 0, -2, 27, 'Basic Industries', 0, N, 1, 27, U])

        rowSet.filter({ colName: 'Sector', type: IN, values: ['Basic Industries', 'Capital Goods'] });
        ({ rows, size } = rowSet.setRange({ lo: 0, hi: 10 }));
        expect(size).toBe(2);
        rowSet.filter({ colName: 'Sector', type: IN, values: ['Basic Industries', 'Capital Goods', 'Consumer Durables'] });
        ({ rows, size } = rowSet.setRange({ lo: 0, hi: 10 }, false));
        expect(size).toBe(3);
        expect(rows).toEqual([
            [N, N, 22.48922592592592,  30965590000,  N, 'Basic Industries',  N, 100, 0, -2, 27, 'Basic Industries', 0, N, 1, 27, U],
            [N, N, 27.76405949367089,  135023840000, N, 'Capital Goods',     N, 101, 0, -2, 79, 'Capital Goods', 0, N, 13, 79, U],
            [N, N, 19.910882857142855, 34227080000,  N, 'Consumer Durables', N, 102, 0, -2, 35, 'Consumer Durables', 0, N, 34, 35, U]
        ]);

    })
});

describe('clearFilter', () => {
    test('clear instruments filter', () => {
        const rowSet = new GroupRowSet(getInstrumentRowset(), instrumentColumns, [['Sector', 'asc']]);
        let { size } = rowSet.setRange({ lo: 0, hi: 17 });
        rowSet.filter({ type: IN, colName: 'Industry', values: ['Advertising'] });
        ({ size } = rowSet.setRange({ lo: 0, hi: 17 }, false));
        expect(size).toBe(2);
        rowSet.clearFilter();
        ({ size } = rowSet.setRange({ lo: 0, hi: 17 }, false));
        expect(size).toBe(12);
    });

    test('aggregations are recalculated when filters are cleared', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns_with_aggregation, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.filter({ type: 'EQ', colName: 'Group 3', value: 'T3' });
        rowSet.clearFilter();
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(4, 6)))).toEqual([
            [0,  0, -2, 8, 'G1',     4.875, 749],
            [1,  0, -1, 4, 'G1/I2',  5,     347],
            [2,  0, -1, 4, 'G1/U2',  4.75,  402],
            [3,  0, -2, 8, 'G2',     5,     800],
            [4,  0, -1, 2, 'G2/I2',  5,     200],
            [5,  0, -1, 4, 'G2/O2',  5,     400],
            [6,  0, -1, 2, 'G2/U2',  5,     200],
            [7,  0, -2, 8, 'G3',     5,     804],
            [8,  0, -1, 2, 'G3/A2',  5,     195],
            [9,  0, -1, 4, 'G3/E2',  5,     415],
            [10, 0,  -1, 1, 'G3/I2', 5,     94],
            [11, 0,  -1, 1, 'G3/O2', 5,     100]
        ]);
    });
});


describe('insert', () => {

    test('insert into single col grouping, all groups collapsed. Group count update', () => {
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1]);
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key25', 'G1', 'I2', 'T5', 6, 112]);
        const results = rowSet.insert(24, table.rows[24])
        expect(rowSet.data[24]).toEqual(['key25', 'G1', 'I2', 'T5', 6, 112, 24, 'key25']);
        expect(results).toEqual({ updates: [[100, rowSet.meta.COUNT, 9]] });
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(13, 14)))).toEqual([
            [0, 0, -1, 9, 'G1', 0],
            [1, 0, -1, 8, 'G2', 9],
            [2, 0, -1, 8, 'G3', 17]
        ]);
    });

    test('insert into single col grouping, group expanded. Group count update plus replace', () => {

        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ G1: true });
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key25', 'G1', 'I2', 'T5', 6, 112]);

        const results = rowSet.insert(24, table.rows[24])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(13, 14)))).toEqual([
            [0, 0, +1, 9, 'G1', 0],
            [1, 0, -1, 8, 'G2', 9],
            [2, 0, -1, 8, 'G3', 17]
        ]);

        // the new row must be sent to client, so we will be asked to send whole rowset
        expect(results).toEqual({replace: true})
        const { rows, size } = rowSet.setRange({ lo: 0, hi: 10 }, false);
        expect(size).toBe(12);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +1, 9, 'G1'],
            [101, 0,  0, 0, 'key01'],
            [102, 0,  0, 0, 'key02'],
            [103, 0,  0, 0, 'key03'],
            [104, 0,  0, 0, 'key04'],
            [105, 0,  0, 0, 'key05'],
            [106, 0,  0, 0, 'key06'],
            [107, 0,  0, 0, 'key07'],
            [108, 0,  0, 0, 'key08'],
            [109, 0,  0, 0, 'key25']
        ]);
    });

    test('insert into multi col grouping, groups collapsed. Group count update at all group levels', () => {

        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key25', 'G1', 'I2', 'T5', 6, 112]);
        const results = rowSet.insert(24, table.rows[24])
        expect(rowSet.groupRows.map(d => d.slice(6, 11))).toEqual([
            [0,  0, -2, 9, 'G1'],
            [1,  0, -1, 5, 'G1/I2'],
            [2,  0, -1, 4, 'G1/U2'],
            [3,  0, -2, 8, 'G2'],
            [4,  0, -1, 2, 'G2/I2'],
            [5,  0, -1, 4, 'G2/O2'],
            [6,  0, -1, 2, 'G2/U2'],
            [7,  0, -2, 8, 'G3'],
            [8,  0, -1, 2, 'G3/A2'],
            [9,  0, -1, 4, 'G3/E2'],
            [10, 0,  -1, 1, 'G3/I2'],
            [11, 0,  -1, 1, 'G3/O2']
        ]);
        expect(results).toEqual({ updates: [[100, rowset.meta.COUNT, 9]] });
    });

    test('insert into correct position in groupedRows, single col groupby, group not present, new group at end', () => {

        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1]);
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key25', 'G4', 'I2', 'T5', 6, 112]);
        const results = rowSet.insert(24, table.rows[24])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(13, 14)))).toEqual([
            [0, 0, -1, 8, 'G1', 0],
            [1, 0, -1, 8, 'G2', 8],
            [2, 0, -1, 8, 'G3', 16],
            [3, 0, -1, 1, 'G4', 24]
        ]);
        expect(results).toEqual({ replace: true });
        const { size } = rowSet.setRange({ lo: 0, hi: 10 }, false);
        expect(size).toBe(4);

    });

    test('insert into correct position in groupedRows, single col groupby, group not present, new group at start', () => {
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1]);
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key25', 'G0', 'I2', 'T5', 6, 112]);
        const results = rowSet.insert(24, table.rows[24])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(13, 14)))).toEqual([
            [0, 0, -1, 1, 'G0', 24],
            [1, 0, -1, 8, 'G1', 0],
            [2, 0, -1, 8, 'G2', 8],
            [3, 0, -1, 8, 'G3', 16]
        ]);
        expect(results).toEqual({ replace: true });
        const { rows, size } = rowSet.setRange({ lo: 0, hi: 10 }, false);
        expect(size).toBe(4);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 1, 'G0'],
            [101, 0, -1, 8, 'G1'],
            [102, 0, -1, 8, 'G2'],
            [103, 0, -1, 8, 'G3']
        ]);
    });

    test('insert into correct position in groupedRows, single col groupby, group not present, new group in middle', () => {
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1]);
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key25', 'G25', 'I2', 'T5', 6, 112]);
        const results = rowSet.insert(24, table.rows[24])
        // console.log(`${join(rowSet.groupRows)} ${join(rowSet.data)} ${join(rowSet.sortSet)}`);
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(13, 14)))).toEqual([
            [0, 0, -1, 8, 'G1', 0],
            [1, 0, -1, 8, 'G2', 8],
            [2, 0, -1, 1, 'G25', 24],
            [3, 0, -1, 8, 'G3', 16]
        ]);
        expect(results).toEqual({ replace: true });
        const { rows, size } = rowSet.setRange({ lo: 0, hi: 10 }, false);
        expect(size).toBe(4);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -1, 8, 'G1'],
            [101, 0, -1, 8, 'G2'],
            [102, 0, -1, 1, 'G25'],
            [103, 0, -1, 8, 'G3']
        ]);
    });

    test('insert into correct position in groupedRows, multi col groupby, group not present, new group at start', () => {
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key25', 'G0', 'I2', 'T5', 6, 112]);
        const results = rowSet.insert(24, table.rows[24])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0,  0, -3, 1, 'G0', null, 1],
            [1,  0, -2, 1, 'G0/I2', 0, 2],
            [2,  0, -1, 1, 'G0/I2/T5', 1, 24],
            [3,  0, -3, 8, 'G1', null, 4],
            [4,  0, -2, 4, 'G1/I2', 3, 5],
            [5,  0, -1, 2, 'G1/I2/T3', 4, 0],
            [6,  0, -1, 1, 'G1/I2/T4', 4, 2],
            [7,  0, -1, 1, 'G1/I2/T5', 4, 3],
            [8,  0, -2, 4, 'G1/U2', 3, 9],
            [9,  0, -1, 2, 'G1/U2/T3', 8, 4],
            [10, 0, -1, 2, 'G1/U2/T4', 8, 6],
            [11, 0, -3, 8, 'G2', null, 12],
            [12, 0, -2, 2, 'G2/I2', 11, 13],
            [13, 0, -1, 2, 'G2/I2/T3', 12, 8],
            [14, 0, -2, 4, 'G2/O2', 11, 15],
            [15, 0, -1, 4, 'G2/O2/T3', 14, 10],
            [16, 0, -2, 2, 'G2/U2', 11, 17],
            [17, 0, -1, 2, 'G2/U2/T3', 16, 14],
            [18, 0, -3, 8, 'G3', null, 19],
            [19, 0, -2, 2, 'G3/A2', 18, 20],
            [20, 0, -1, 2, 'G3/A2/T3', 19, 16],
            [21, 0, -2, 4, 'G3/E2', 18, 22],
            [22, 0, -1, 4, 'G3/E2/T3', 21, 18],
            [23, 0, -2, 1, 'G3/I2', 18, 24],
            [24, 0, -1, 1, 'G3/I2/T3', 23, 22],
            [25, 0, -2, 1, 'G3/O2', 18, 26],
            [26, 0, -1, 1, 'G3/O2/T3', 25, 23]
        ]);
        expect(results).toEqual({ replace: true });
        const { rows, size } = rowSet.setRange({ lo: 0, hi: 10 }, false);
        expect(size).toBe(4);
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, -3, 1, 'G0'],
            [101, 0, -3, 8, 'G1'],
            [102, 0, -3, 8, 'G2'],
            [103, 0, -3, 8, 'G3']
        ]);
    });

    test('repeated inserts into empty rowset, multi col groupby', () => {

        const [table, rowset] = getEmptyTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, rowset_columns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3]);
        rowSet.setRange({ lo: 0, hi: 10 });
        table.insert(['key01', 'G1', 'I2', 'T3', 6, 112]);
        let results = rowSet.insert(0, table.rows[0])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -3, 1, 'G1', null, 1],
            [1, 0, -2, 1, 'G1/I2', 0, 2],
            [2, 0, -1, 1, 'G1/I2/T3', 1, 0]
        ]);

        table.insert(['key02', 'G1', 'O2', 'T3', 8, 88]);
        results = rowSet.insert(1, table.rows[1]);
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -3, 2, 'G1', null, 1],
            [1, 0, -2, 1, 'G1/I2', 0, 2],
            [2, 0, -1, 1, 'G1/I2/T3', 1, 0],
            [3, 0, -2, 1, 'G1/O2', 0, 4],
            [4, 0, -1, 1, 'G1/O2/T3', 3, 1]
        ]);

        // neither row or new groups will be sent to client, but count shoule be updated on top group
        expect(results).toEqual({ updates: [[100, rowset.meta.COUNT, 2]] });

        table.insert(['key03', 'G1', 'I2', 'T4', 8, 88]);
        results = rowSet.insert(2, table.rows[2])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -3, 3, 'G1', null, 1],
            [1, 0, -2, 2, 'G1/I2', 0, 2],
            [2, 0, -1, 1, 'G1/I2/T3', 1, 0],
            [3, 0, -1, 1, 'G1/I2/T4', 1, 2],
            [4, 0, -2, 1, 'G1/O2', 0, 5],
            [5, 0, -1, 1, 'G1/O2/T3', 4, 1]
        ]);

        table.insert(['key04', 'G1', 'I2', 'T3', 10, 100]);
        results = rowSet.insert(3, table.rows[3])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -3, 4, 'G1', null, 1],
            [1, 0, -2, 3, 'G1/I2', 0, 2],
            [2, 0, -1, 2, 'G1/I2/T3', 1, 0],
            [3, 0, -1, 1, 'G1/I2/T4', 1, 3],
            [4, 0, -2, 1, 'G1/O2', 0, 5],
            [5, 0, -1, 1, 'G1/O2/T3', 4, 2]
        ]);

        table.insert(['key05', 'G3', 'E2', 'T3', 10, 100]);
        results = rowSet.insert(4, table.rows[4])
        expect(rowSet.groupRows.map(d => d.slice(6, 11).concat(d.slice(12, 14)))).toEqual([
            [0, 0, -3, 4, 'G1', null, 1],
            [1, 0, -2, 3, 'G1/I2', 0, 2],
            [2, 0, -1, 2, 'G1/I2/T3', 1, 0],
            [3, 0, -1, 1, 'G1/I2/T4', 1, 3],
            [4, 0, -2, 1, 'G1/O2', 0, 5],
            [5, 0, -1, 1, 'G1/O2/T3', 4, 2],
            [6, 0, -3, 1, 'G3', null, 7],
            [7, 0, -2, 1, 'G3/E2', 6, 8],
            [8, 0, -1, 1, 'G3/E2/T3', 7, 4]
        ]);

    });
});

describe('insert + update', () => {

    test('single col grouping, all collapsed', () => {
        const aggColumns = rowset_columns_with_aggregation;
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, aggColumns, [GROUP_COL_1]);
        rowSet.setRange({ lo: 0, hi: 10 })

        table.insert(['key25', 'G1', 'I2', 'T5', 6, 112]);
        rowSet.insert(24, table.rows[24])
        
        let results = rowSet.update(24, [4, 9, 10.125]);
        expect(results).toEqual([[100, 4, 4.875, 5]])    
    })

    test('single col grouping, target group expanded', () => {
        const aggColumns = rowset_columns_with_aggregation;
        const [table, rowset] = getTestTableAndRowset();
        const rowSet = new GroupRowSet(rowset, aggColumns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true });
        rowSet.setRange({ lo: 0, hi: 10 })

        table.insert(['key25', 'G1', 'I2', 'T5', 6, 112]);
        rowSet.insert(24, table.rows[24])

        let results = rowSet.update(24, [4, 9, 10.125]);
        expect(results).toEqual([
            [100, 4, 4.875, 5],
            [109, 4, 9, 10.125]
        ])    
    })

})

describe('update', () => {
    const aggColumns = rowset_columns_with_aggregation;
    test('update single  and multiple values, group collapsed, no aggregation', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setRange({ lo: 0, hi: 10 })
        let results = rowSet.update(4, [4, 9, 9.5]);
        expect(results).toEqual([])
        results = rowSet.update(4, [4, 9, 9.5, 5, 100, 200]);
        expect(results).toEqual([])
    });

    test('single level grouping update single value, first group expanded, no aggregation', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true })
        rowSet.setRange({ lo: 0, hi: 10 });
        const updates = rowSet.update(4, [4, 9, 9.5]);
        expect(updates).toEqual([[105, 4, 9, 9.5]]);
    });

    test('two level grouping update single value, second group expanded, no aggregation', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setGroupState({ 'G2': { 'I2': true } })
        rowSet.setRange({ lo: 0, hi: 10 });
        const updates = rowSet.update(10, [4, 5, 25]);
        expect(updates).toEqual([[103, 4, 5, 25]]);
    });

    test('update single value, second group expanded, no aggregation', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G2': true })
        rowSet.setRange({ lo: 0, hi: 10 });
        const updates = rowSet.update(8, [4, 5, 5.5]);
        expect(updates).toEqual([[102, 4, 5, 5.5]]);
    });

    test('update single value, second group expanded, scrolled down, no aggregation', () => {
        const rowSet = new GroupRowSet(getInstrumentRowset(), instrumentColumns, [['Sector', 'asc']]);
        rowSet.setGroupState({ 'Basic Industries': true })
        rowSet.setRange({ lo: 0, hi: 25 });
        rowSet.setRange({ lo: 14, hi: 38 });
        const updates = rowSet.update(1131, [2, 7.21, 8]);
        expect(updates).toEqual([[124, 2, 7.21, 8]])
    });

    test('update single value, single group expanded, aggregated on column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), aggColumns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true })
        // get results so update acts as though client has data
        rowSet.setRange({ lo: 0, hi: 10 });
        const updates = rowSet.update(4, [4, 9, 9.5, 5, 100, 50]);
        expect(rowSet.groupRows[0][4]).toBe(4.9375);
        expect(rowSet.groupRows[0][5]).toBe(699);
        expect(updates).toEqual([
            [100, 4, 4.875, 4.9375, 5, 749, 699],
            [105, 4, 9, 9.5, 5, 100, 50]
        ]);
    });

    test('update single value, two level grouping, first groups expanded, aggregated on column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), aggColumns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setGroupState({ 'G1': {'I2': true} })
        // get results so update acts as though client has data
        rowSet.setRange({ lo: 0, hi: 10 });
        const updates = rowSet.update(4, [4, 9, 9.5, 5, 100, 50]);
        expect(updates).toEqual([
            [100, 4, 4.875, 4.9375, 5, 749, 699],
            [101, 4, 5, 5.125, 5, 347, 297],
            [102, 4, 9, 9.5, 5, 100, 50]
        ]);
    });

    test('update single value, two level grouping, non-first groups expanded, aggregated on column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), aggColumns, [GROUP_COL_1, GROUP_COL_2]);
        rowSet.setGroupState({ 'G2': {'U2': true} })
        // get results so update acts as though client has data
        rowSet.setRange({ lo: 0, hi: 10 });
        const updates = rowSet.update(8, [4, 5, 99, 5, 100, 199]);

        expect(updates).toEqual([
            [101, 4, 5, 16.75, 5, 800, 899],
            [104, 4, 5, 52, 5, 200, 299],
            [105, 4, 5, 99, 5, 100, 199]
        ]);
    });

    test('update single value, single group expanded, aggregated on column,no data sent to client yet', () => {
        const rowSet = new GroupRowSet(getTestRowset(), aggColumns, [GROUP_COL_1]);
        rowSet.setGroupState({ 'G1': true })
        const updates = rowSet.update(4, [4, 9, 9.5, 5, 100, 50]);
        expect(rowSet.groupRows[0][4]).toBe(4.9375);
        expect(rowSet.groupRows[0][5]).toBe(699);
        expect(updates).toEqual([]);
    });

    //TODO
    // test('update a value on which rows are grouped', () => {
    //     const rowSet = new GroupRowSet(_getRowset(), _columns, [GROUP_COL_1]);
    //     const results = rowSet.update('key05', [1,'G2']);
    //     const {groupedRows, data, index} = groupRowset;
    //     // console.log(groupedRows.map(r => `[${r}]`).join('\n'));
    //     // console.log(data);
    //     // console.log(index);
    //     // console.log(results)
    // });

});

describe('aggregation', () => {
    const aggColumns = rowset_columns_with_aggregation;

    test('simple aggregation across 1 col, avg and sum', () => {
        const rowSet = new GroupRowSet(getTestRowset(), aggColumns, [GROUP_COL_1])
        // console.log(`${join(rowSet.groupRows)} ${join(rowSet.data)}`);
        // console.log(rowSet.sortSet)
        // console.log(rowSet.filterSet)
        expect(rowSet.groupRows[0][4]).toBe(4.875)
        expect(rowSet.groupRows[0][5]).toBe(749)

    })

    test('aggregation across two columns', () => {
        const rowSet = new GroupRowSet(getTestRowset(), aggColumns, [GROUP_COL_1, GROUP_COL_2])
        // console.log(`${join(rowSet.groupRows)} ${join(rowSet.data)}`);
        expect(rowSet.groupRows[0][4]).toBe(4.875)
        expect(rowSet.groupRows[0][5]).toBe(749)
        expect(rowSet.groupRows[1][4]).toBe(5);
        expect(rowSet.groupRows[1][5]).toBe(347);
        expect(rowSet.groupRows[2][4]).toBe(4.75);
        expect(rowSet.groupRows[2][5]).toBe(402);
    });

    test('aggregation across three columns', () => {
        const rowSet = new GroupRowSet(getTestRowset(), aggColumns, [GROUP_COL_1, GROUP_COL_2, GROUP_COL_3])
        // console.log(`${join(rowSet.groupRows)} ${join(rowSet.data)}`);
        expect(rowSet.groupRows[0][4]).toBe(4.875);
        expect(rowSet.groupRows[0][5]).toBe(749);
    });

    // test('updates affecting aggregation', () =>{

    //     const rowSet = new Rowset(_get_data(),_columns, 100)
    //     const groupRowset = new GroupRowSet(rowSet, _columns_with_aggregation, [[5,'asc','Group 1'],[6,'asc','Group 2'],[7,'asc','Group 3']]);
    //     const results = groupRowset.update('key06', [4,9,5,100]);

    //     const {groupedRows, data, index} = groupRowset;
    //     // console.log(groupedRows.map(r => `[${r}]`).join('\n'));
    //     // console.log(data);
    //     // console.log(index);
    //     // console.log(results);
    //     expect(data.map(r => [r[8],r[9]])).toEqual([
    //     [5.375, 804],
    //     [5,800],
    //     [5,804]
    //     ]);

    //     expect(results).toEqual([ [ 100, 4, 5.375 ], [ 100, 5, 804 ] ]);

    //     // test some of the recalculated mid-level aggregations
    //     expect(groupedRows[1][8]).toBe(6) 
    //     expect(groupedRows[1][9]).toBe(402) 
    //     expect(groupedRows[2][8]).toBe(9) 
    //     expect(groupedRows[2][9]).toBe(200) 
    // })

})

describe('setRange', () => {
    test('from beginning, scroll forwards, contiguous or overlaps, useDelta defaults to true', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ G1: true, G2: true, G3: true });

        let { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +1, 8, 'G1'],
            [101, 0,  0, 0, 'key01'],
            [102, 0,  0, 0, 'key02'],
            [103, 0,  0, 0, 'key03'],
            [104, 0,  0, 0, 'key04'],
            [105, 0,  0, 0, 'key05'],
            [106, 0,  0, 0, 'key06'],
            [107, 0,  0, 0, 'key07'],
            [108, 0,  0, 0, 'key08'],
            [109, 0, +1, 8, 'G2']
        ]);
        ({ rows } = rowSet.setRange({ lo: 5, hi: 15 }));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [110, 0, 0, 0, 'key09'],
            [111, 0, 0, 0, 'key10'],
            [112, 0, 0, 0, 'key11'],
            [113, 0, 0, 0, 'key12'],
            [114, 0, 0, 0, 'key13']
        ]);
        ({ rows } = rowSet.setRange({ lo: 15, hi: 25 }));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [115, 0,  0, 0, 'key14'],
            [116, 0,  0, 0, 'key15'],
            [117, 0,  0, 0, 'key16'],
            [118, 0, +1, 8, 'G3'],
            [119, 0,  0, 0, 'key17'],
            [120, 0,  0, 0, 'key18'],
            [121, 0,  0, 0, 'key19'],
            [122, 0,  0, 0, 'key20'],
            [123, 0,  0, 0, 'key21'],
            [124, 0,  0, 0, 'key22']
        ]);
        ({ rows } = rowSet.setRange({ lo: 20, hi: 30 }));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [125, 0, 0, 0, 'key23'],
            [126, 0, 0, 0, 'key24']
        ]);
    });

    test('from beginning, scroll forwards, with range gaps, allow useDelta to default', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ G1: true, G2: true, G3: true });

        let { rows } = rowSet.setRange({ lo: 0, hi: 10 });

        ({ rows } = rowSet.setRange({ lo: 11, hi: 15 }));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [111, 0, 0, 0, 'key10'],
            [112, 0, 0, 0, 'key11'],
            [113, 0, 0, 0, 'key12'],
            [114, 0, 0, 0, 'key13']
        ]);

        ({ rows } = rowSet.setRange({ lo: 20, hi: 25 }));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [120, 0, 0, 0, 'key18'],
            [121, 0, 0, 0, 'key19'],
            [122, 0, 0, 0, 'key20'],
            [123, 0, 0, 0, 'key21'],
            [124, 0, 0, 0, 'key22']
        ]);

        ({ rows } = rowSet.setRange({ lo: 26, hi: 27 }));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [126, 0, 0, 0, 'key24']
        ]);
    });

    test('scroll forwards then back', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ G1: true, G2: true, G3: true });

        let { rows } = rowSet.setRange({ lo: 0, hi: 10 });
        ({ rows } = rowSet.setRange({ lo: 5, hi: 15 }));
        ({ rows } = rowSet.setRange({ lo: 15, hi: 25 }));
        ({ rows } = rowSet.setRange({ lo: 20, hi: 27 }));
        ({ rows } = rowSet.setRange({ lo: 10, hi: 20 }));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [110, 0,  0, 0, 'key09'],
            [111, 0,  0, 0, 'key10'],
            [112, 0,  0, 0, 'key11'],
            [113, 0,  0, 0, 'key12'],
            [114, 0,  0, 0, 'key13'],
            [115, 0,  0, 0, 'key14'],
            [116, 0,  0, 0, 'key15'],
            [117, 0,  0, 0, 'key16'],
            [118, 0, +1, 8, 'G3'],
            [119, 0,  0, 0, 'key17']
        ]);

    });

    test('re-request same range, useDelta false', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.setGroupState({ G1: true, G2: true, G3: true });

        let { rows } = rowSet.setRange({ lo: 0, hi: 10 });

        ({ rows } = rowSet.setRange({ lo: 0, hi: 10 }, false));
        expect(rows.map(d => d.slice(6, 11))).toEqual([
            [100, 0, +1, 8, 'G1'],
            [101, 0,  0, 0, 'key01'],
            [102, 0,  0, 0, 'key02'],
            [103, 0,  0, 0, 'key03'],
            [104, 0,  0, 0, 'key04'],
            [105, 0,  0, 0, 'key05'],
            [106, 0,  0, 0, 'key06'],
            [107, 0,  0, 0, 'key07'],
            [108, 0,  0, 0, 'key08'],
            [109, 0, +1, 8, 'G2']
        ]);
    });

    test('scroll through instrument rows', () => {
        const rowSet = new GroupRowSet(getInstrumentRowset(), instrumentColumns, [
            ['Sector', 'asc'], ['Industry', 'asc'], ['IPO', 'asc']]);
        rowSet.setGroupState({ 'Basic Industries': { 'Agricultural Chemicals': true } })
        const N = null;
        const U = undefined;
        let { rows, size } = rowSet.setRange({ lo: 0, hi: 17 });
        expect(size).toBe(25)
        expect(rows).toEqual([
    //  Symbol Name Price              Qty          IPO     Industry                 Sector
            [N, N, 22.48922592592592,  30965590000,  N,     'Basic Industries',      N,                           100, 0,  3, 27, 'Basic Industries', 0, N, 1, U, U],
            [N, N, 2.57,               382560000,    N,     'Basic Industries',     'Agricultural Chemicals',     101, 0,  2, 2,  'Basic Industries/Agricultural Chemicals', 0, 0, 2, U, U],
            [N, N, 1.26,               287890000,   '1991', 'Basic Industries',     'Agricultural Chemicals',     102, 0, -1, 1,  'Basic Industries/Agricultural Chemicals/1991', 0, 1, 0, U, U],
            [N, N, 3.88,               94670000,    '2013', 'Basic Industries',     'Agricultural Chemicals',     103, 0, -1, 1,  'Basic Industries/Agricultural Chemicals/2013', 0, 1, 1, U, U],
            [N, N, 23.1,               2050000000,   N,     'Basic Industries',     'Aluminum',                   104, 0, -2, 1,  'Basic Industries/Aluminum', 0, 0, 5, U, U],
            [N, N, 0.44,               59480000,     N,     'Basic Industries',     'Containers/Packaging',       105, 0, -2, 1,  'Basic Industries/Containers/Packaging', 0, 0, 7, U, U],
            [N, N, 28.483333333333334, 6218610000,   N,     'Basic Industries',     'Engineering & Construction', 106, 0, -2, 3,  'Basic Industries/Engineering & Construction', 0, 0, 9, U, U],
            [N, N, 131.07,             11130000000,  N,     'Basic Industries',     'Environmental Services',     107, 0, -2, 1,  'Basic Industries/Environmental Services', 0, 0, 13, U, U],
            [N, N, 48.135,             1736160000,   N,     'Basic Industries',     'Forest Products',            108, 0, -2, 2,  'Basic Industries/Forest Products', 0, 0, 15, U, U],
            [N, N, 16.2859,            3689640000,   N,     'Basic Industries',     'Major Chemicals',            109, 0, -2, 10, 'Basic Industries/Major Chemicals', 0, 0, 18, U, U],
            [N, N, 16.29,              178900000,    N,     'Basic Industries',     'Metal Fabrications',         110, 0, -2, 1,  'Basic Industries/Metal Fabrications', 0, 0, 26, U, U],
            [N, N, 12.05,              265900000,    N,     'Basic Industries',     'Miscellaneous',              111, 0, -2, 1,  'Basic Industries/Miscellaneous', 0, 0, 28, U, U],
            [N, N, 3.9,                12870000,     N,     'Basic Industries',     'Specialty Chemicals',        112, 0, -2, 1,  'Basic Industries/Specialty Chemicals', 0, 0, 30, U, U],
            [N, N, 17.660025,          5241470000,   N,     'Basic Industries',     'Steel/Iron Ore',             113, 0, -2, 4,  'Basic Industries/Steel/Iron Ore', 0, 0, 32, U, U],
            [N, N, 27.76405949367089,  135023840000, N,     'Capital Goods',         N,                           114, 0, -3, 79, 'Capital Goods', 0, N, 37, U, U],
            [N, N, 19.910882857142855, 34227080000,  N,     'Consumer Durables',     N,                           115, 0, -3, 35, 'Consumer Durables', 0, N, 125, U, U],
            [N, N, 35.0023825,         76043890000,  N,     'Consumer Non-Durables', N,                           116, 0, -3, 40, 'Consumer Non-Durables', 0, N, 174, U, U]
        ]);

        rowSet.groupBy([['Sector', 'asc'], ['Industry', 'asc']]);
        ({ rows, size } = rowSet.setRange({ lo: 0, hi: 17 }, false));
        expect(rows).toEqual([
            [ N,      N,                              22.48922592592592,  30965590000,  N,     'Basic Industries',      N,                           100, 0,  2, 27, 'Basic Industries', 0, N, 1, U, U],
            [ N,      N,                              2.57,               382560000,    N,     'Basic Industries',     'Agricultural Chemicals',     101, 0,  1, 2, 'Basic Industries/Agricultural Chemicals', 0, 0, 0, U, U],
            ['RTK',  'Rentech, Inc.',                 1.26,               287890000,   '1991', 'Basic Industries',     'Agricultural Chemicals',     102, 0,  0, 0, 'RTK'], // why don't these have SELECTED at the end ?
            ['MBII', 'Marrone Bio Innovations, Inc.', 3.88,               94670000,    '2013', 'Basic Industries',     'Agricultural Chemicals',     103, 0,  0, 0, 'MBII'],
            [ N,      N,                              23.1,               2050000000,   N,     'Basic Industries',     'Aluminum',                   104, 0, -1, 1, 'Basic Industries/Aluminum', 0, 0, 2, U, U],
            [ N,      N,                              0.44,               59480000,     N,     'Basic Industries',     'Containers/Packaging',       105, 0, -1, 1, 'Basic Industries/Containers/Packaging', 0, 0, 3, U, U],
            [ N,      N,                              28.483333333333334, 6218610000,   N,     'Basic Industries',     'Engineering & Construction', 106, 0, -1, 3, 'Basic Industries/Engineering & Construction', 0, 0, 4, U, U],
            [ N,      N,                              131.07,             11130000000,  N,     'Basic Industries',     'Environmental Services',     107, 0, -1, 1, 'Basic Industries/Environmental Services', 0, 0, 7, U, U],
            [ N,      N,                              48.135,             1736160000,   N,     'Basic Industries',     'Forest Products',            108, 0, -1, 2, 'Basic Industries/Forest Products', 0, 0, 8, U, U],
            [ N,      N,                              16.2859,            3689640000,   N,     'Basic Industries',     'Major Chemicals',            109, 0, -1, 10, 'Basic Industries/Major Chemicals', 0, 0, 10, U, U],
            [ N,      N,                              16.29,              178900000,    N,     'Basic Industries',     'Metal Fabrications',         110, 0, -1, 1, 'Basic Industries/Metal Fabrications', 0, 0, 20, U, U],
            [ N,      N,                              12.05,              265900000,    N,     'Basic Industries',     'Miscellaneous',              111, 0, -1, 1, 'Basic Industries/Miscellaneous', 0, 0, 21, U, U],
            [ N,      N,                              3.9,                12870000,     N,     'Basic Industries',     'Specialty Chemicals',        112, 0, -1, 1, 'Basic Industries/Specialty Chemicals', 0, 0, 22, U, U],
            [ N,      N,                              17.660025,          5241470000,   N,     'Basic Industries',     'Steel/Iron Ore',             113, 0, -1, 4, 'Basic Industries/Steel/Iron Ore', 0, 0, 23, U, U],
            [ N,      N,                              27.76405949367089,  135023840000, N,     'Capital Goods',         N,                           114, 0, -2, 79, 'Capital Goods', 0, N, 13, U, U],
            [ N,      N,                              19.910882857142855, 34227080000,  N,     'Consumer Durables',     N,                           115, 0, -2, 35, 'Consumer Durables', 0, N, 34, U, U],
            [ N,      N,                              35.0023825,         76043890000,  N,     'Consumer Non-Durables', N,                           116, 0, -2, 40, 'Consumer Non-Durables', 0, N, 49, U, U]
        ]);


    })

});

describe('getDistinctValuesForColumn', () => {
    test('no current filter in place', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        const filterRowset = rowSet.getDistinctValuesForColumn({ name: 'Group 3' });
        const results = filterRowset.setRange({ lo: 0, hi: 10 });
        expect(results.rows).toEqual([
            ['T3', 20, 20, 0, 0, 0, 0, 'T3', 0],
            ['T4', 3,  3,  1, 0, 0, 0, 'T4', 0],
            ['T5', 1,  1,  2, 0, 0, 0, 'T5', 0]
        ])
    });

    test('with filter on another column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({ type: NOT_IN, colName: 'Group 2', values: ['I2'] })
        const filterRowset = rowSet.getDistinctValuesForColumn({ name: 'Group 3' });
        const results = filterRowset.setRange({ lo: 0, hi: 10 });
        expect(results.rows).toEqual([
            ['T3', 15, 20, 0, 0, 0, 0, 'T3', 0],
            ['T4', 2,  3,  1, 0, 0, 0, 'T4', 0],
            ['T5', 0,  1,  2, 0, 0, 0, 'T5', 0]
        ])
    });

    test('with filters on both another column and current column', () => {
        const rowSet = new GroupRowSet(getTestRowset(), rowset_columns, [GROUP_COL_1]);
        rowSet.filter({
            type: 'AND',
            filters: [
                { type: EQUALS, colName: 'Group 1', value: 'G1' },
                { type: NOT_IN, colName: 'Group 2', values: ['I2'] }
            ]
        }
        );

        const filterRowset = rowSet.getDistinctValuesForColumn({ name: 'Group 1' });
        const results = filterRowset.setRange({ lo: 0, hi: 10 });
        expect(results.rows).toEqual([
            ['G1', 4, 8, 0, 0, 0, 0, 'G1', 0],
            ['G2', 0, 8, 1, 0, 0, 0, 'G2', 0],
            ['G3', 0, 8, 2, 0, 0, 0, 'G3', 0]
        ])
    });

    test('check filter counts against distinct value counts', () => {
        const rowSet = new GroupRowSet(getInstrumentRowset(), instrumentColumns, [['Sector', 'asc']]);
        let { rows } = rowSet.setRange({ lo: 0, hi: 17 });
        const filterRowset = rowSet.getDistinctValuesForColumn({ name: 'Industry' })
        const results = filterRowset.setRange({ lo: 0, hi: 10 });
        expect(results.rows[0]).toEqual(['Advertising', 10, 10, 0, 0, 0, 0, 'Advertising', 0])
        rowSet.filter({ type: IN, colName: 'Industry', values: [] });
        ({ rows } = rowSet.setRange({ lo: 0, hi: 17 }, false));

        rowSet.filter({ type: IN, colName: 'Industry', values: ['Advertising'] });
        ({ rows } = rowSet.setRange({ lo: 0, hi: 17 }, false));

        expect(rows.map(d => d.slice(7, 13))).toEqual([
            [100, 0, -1, 4, 'Consumer Services', 0],
            [101, 0, -1, 6, 'Technology', 0]
        ]);

    })
});
