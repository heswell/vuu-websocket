const {RowSet, filter: {IN, GREATER_THAN}} = require('../../dist/index.js');

const {
    getInstrumentRowset,
    getTestTable,
    getTestRowset,
    columns: rowset_columns,
} = require('../../test-data.js');

const DEFAULT_OFFSET =100;

describe('construction', () => {
    test('Rowset creation', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET);
        expect(rowSet.size).toBe(24);
    });
});


describe('setRange', () => {
    test('initial call to setRange', () => {
        const rowSet = getTestRowset();
        let {rows, size} = rowSet.setRange({lo: 0, hi: 10});

        expect(rows).toEqual([
            ['key01', 'G1', 'U2', 'T3', 5, 101, 100, 0, 0, 0, 'key01', 0],
            ['key02', 'G1', 'U2', 'T3', 5, 102, 101, 0, 0, 0, 'key02', 0],
            ['key03', 'G1', 'U2', 'T4', 4, 100, 102, 0, 0, 0, 'key03', 0],
            ['key04', 'G1', 'U2', 'T4', 5, 99,  103, 0, 0, 0, 'key04', 0],
            ['key05', 'G1', 'I2', 'T3', 9, 100, 104, 0, 0, 0, 'key05', 0],
            ['key06', 'G1', 'I2', 'T3', 5, 45,  105, 0, 0, 0, 'key06', 0],
            ['key07', 'G1', 'I2', 'T4', 1, 100, 106, 0, 0, 0, 'key07', 0],
            ['key08', 'G1', 'I2', 'T5', 5, 102, 107, 0, 0, 0, 'key08', 0],
            ['key09', 'G2', 'U2', 'T3', 5, 100, 108, 0, 0, 0, 'key09', 0],
            ['key10', 'G2', 'U2', 'T3', 5, 100, 109, 0, 0, 0, 'key10', 0]
        ]);
        expect(size).toBe(24);
    })

    test('delta call to setRange', () => {
        const rowSet = getTestRowset();
        let {rows, size} = rowSet.setRange({lo: 0, hi: 10});
        ({rows, size} = rowSet.setRange({lo: 5, hi: 15}));

        expect(rows).toEqual([
            ['key11', 'G2', 'I2', 'T3', 5, 100, 110, 0, 0, 0, 'key11', 0],
            ['key12', 'G2', 'I2', 'T3', 5, 100, 111, 0, 0, 0, 'key12', 0],
            ['key13', 'G2', 'O2', 'T3', 5, 100, 112, 0, 0, 0, 'key13', 0],
            ['key14', 'G2', 'O2', 'T3', 5, 100, 113, 0, 0, 0, 'key14', 0],
            ['key15', 'G2', 'O2', 'T3', 5, 100, 114, 0, 0, 0, 'key15', 0]
        ]);
        expect(size).toBe(24);
    })

    test('subset of columns, rearranged', () => {
        const table = getTestTable();
        const columns = [
            { name: 'Key Col' },
            { name: 'Qty' },
            { name: 'Price' }
        ];
        const rowSet = new RowSet(table, columns, DEFAULT_OFFSET)
        let {rows, size} = rowSet.setRange({lo: 0, hi: 10});

        expect(rows).toEqual([
            ['key01', 101, 5, 100, 0, 0, 0, 'key01', 0],
            ['key02', 102, 5, 101, 0, 0, 0, 'key02', 0],
            ['key03', 100, 4, 102, 0, 0, 0, 'key03', 0],
            ['key04', 99,  5, 103, 0, 0, 0, 'key04', 0],
            ['key05', 100, 9, 104, 0, 0, 0, 'key05', 0],
            ['key06', 45,  5, 105, 0, 0, 0, 'key06', 0],
            ['key07', 100, 1, 106, 0, 0, 0, 'key07', 0],
            ['key08', 102, 5, 107, 0, 0, 0, 'key08', 0],
            ['key09', 100, 5, 108, 0, 0, 0, 'key09', 0],
            ['key10', 100, 5, 109, 0, 0, 0, 'key10', 0],
        ]);

        expect(size).toBe(24);
    })
})

describe('sort', () => {

    test('simple sort', () => {
        const rowSet = getTestRowset();
        rowSet.sort([['Qty', 'asc']])
        const {rows} = rowSet.setRange({lo: 0, hi: 25})

        expect(rows).toEqual([
            ['key06','G1','I2','T3',5,45, 100, 0, 0, 0, 'key06', 0],
            ['key23','G3','I2','T3',5,94, 101, 0, 0, 0, 'key23', 0],
            ['key22','G3','A2','T3',5,95, 102, 0, 0, 0, 'key22', 0],
            ['key04','G1','U2','T4',5,99, 103, 0, 0, 0, 'key04', 0],
            ['key03','G1','U2','T4',4,100,104, 0, 0, 0, 'key03', 0],
            ['key05','G1','I2','T3',9,100,105, 0, 0, 0, 'key05', 0],
            ['key07','G1','I2','T4',1,100,106, 0, 0, 0, 'key07', 0],
            ['key09','G2','U2','T3',5,100,107, 0, 0, 0, 'key09', 0],
            ['key10','G2','U2','T3',5,100,108, 0, 0, 0, 'key10', 0],
            ['key11','G2','I2','T3',5,100,109, 0, 0, 0, 'key11', 0],
            ['key12','G2','I2','T3',5,100,110, 0, 0, 0, 'key12', 0],
            ['key13','G2','O2','T3',5,100,111, 0, 0, 0, 'key13', 0],
            ['key14','G2','O2','T3',5,100,112, 0, 0, 0, 'key14', 0],
            ['key15','G2','O2','T3',5,100,113, 0, 0, 0, 'key15', 0],
            ['key16','G2','O2','T3',5,100,114, 0, 0, 0, 'key16', 0],
            ['key19','G3','E2','T3',5,100,115, 0, 0, 0, 'key19', 0],
            ['key21','G3','A2','T3',5,100,116, 0, 0, 0, 'key21', 0],
            ['key24','G3','O2','T3',5,100,117, 0, 0, 0, 'key24', 0],
            ['key01','G1','U2','T3',5,101,118, 0, 0, 0, 'key01', 0],
            ['key18','G3','E2','T3',5,101,119, 0, 0, 0, 'key18', 0],
            ['key02','G1','U2','T3',5,102,120, 0, 0, 0, 'key02', 0],
            ['key08','G1','I2','T5',5,102,121, 0, 0, 0, 'key08', 0],
            ['key20','G3','E2','T3',5,104,122, 0, 0, 0, 'key20', 0],
            ['key17','G3','E2','T3',5,110,123, 0, 0, 0, 'key17', 0]
        ])
    })

    test('simple sort, multiple columns', () => {
        const rowSet = getTestRowset();
        rowSet.sort([['Qty', 'asc'],['Price', 'asc']])
        const {rows} = rowSet.setRange({lo: 0, hi: 25})

        expect(rows).toEqual([
            ['key06','G1','I2','T3',5,45,  100, 0, 0, 0, 'key06', 0],
            ['key23','G3','I2','T3',5,94,  101, 0, 0, 0, 'key23', 0],
            ['key22','G3','A2','T3',5,95,  102, 0, 0, 0, 'key22', 0],
            ['key04','G1','U2','T4',5,99,  103, 0, 0, 0, 'key04', 0],
            ['key07','G1','I2','T4',1,100, 104, 0, 0, 0, 'key07', 0],
            ['key03','G1','U2','T4',4,100, 105, 0, 0, 0, 'key03', 0],
            ['key09','G2','U2','T3',5,100, 106, 0, 0, 0, 'key09', 0],
            ['key10','G2','U2','T3',5,100, 107, 0, 0, 0, 'key10', 0],
            ['key11','G2','I2','T3',5,100, 108, 0, 0, 0, 'key11', 0],
            ['key12','G2','I2','T3',5,100, 109, 0, 0, 0, 'key12', 0],
            ['key13','G2','O2','T3',5,100, 110, 0, 0, 0, 'key13', 0],
            ['key14','G2','O2','T3',5,100, 111, 0, 0, 0, 'key14', 0],
            ['key15','G2','O2','T3',5,100, 112, 0, 0, 0, 'key15', 0],
            ['key16','G2','O2','T3',5,100, 113, 0, 0, 0, 'key16', 0],
            ['key19','G3','E2','T3',5,100, 114, 0, 0, 0, 'key19', 0],
            ['key21','G3','A2','T3',5,100, 115, 0, 0, 0, 'key21', 0],
            ['key24','G3','O2','T3',5,100, 116, 0, 0, 0, 'key24', 0],
            ['key05','G1','I2','T3',9,100, 117, 0, 0, 0, 'key05', 0],
            ['key01','G1','U2','T3',5,101, 118, 0, 0, 0, 'key01', 0],
            ['key18','G3','E2','T3',5,101, 119, 0, 0, 0, 'key18', 0],
            ['key02','G1','U2','T3',5,102, 120, 0, 0, 0, 'key02', 0],
            ['key08','G1','I2','T5',5,102, 121, 0, 0, 0, 'key08', 0],
            ['key20','G3','E2','T3',5,104, 122, 0, 0, 0, 'key20', 0],
            ['key17','G3','E2','T3',5,110, 123, 0, 0, 0, 'key17', 0]
        ]);
    });

    test('add column to existing sort', () => {
        const rowSet = getTestRowset();
        rowSet.sort([['Qty', 'asc']])
        rowSet.sort([['Qty', 'asc'],['Price', 'asc']])
        const {rows} = rowSet.setRange({lo: 0, hi: 25})
        expect(rows.map(row => row.slice(4,6))).toEqual([
            [5,45],
            [5,94],
            [5,95],
            [5,99],
            [1,100],
            [4,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [9,100],
            [5,101],
            [5,101],
            [5,102],
            [5,102],
            [5,104],
            [5,110]
        ]);

    });

    test('sort filtered rowSet', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        rowSet.sort([['Price', 'asc']])
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(14);
        expect(rows.map(row => row.slice(4,6))).toEqual([
            [1,100],
            [4,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [9,100]
        ]);

    });

    test('reverse sort filtered rowSet', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        rowSet.sort([['Price', 'dsc']])
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(14);
        expect(rows.map(row => row.slice(4,6))).toEqual([
            [9,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [4,100],
            [1,100],
        ]);

    });

    test('sort, then reverse sort filtered rowSet', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        rowSet.sort([['Price', 'asc']])
        rowSet.sort([['Price', 'dsc']])
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(14);
        expect(rows.map(row => row.slice(4,6))).toEqual([
            [9,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [5,100],
            [4,100],
            [1,100],
        ]);

    });


});

describe('filter', () => {
    test('simple filter', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        const {size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(14);
    });

    test('filter preserves sort order', () => {
        const rowSet = getTestRowset();
        rowSet.sort([['Price', 'asc']])
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(14);
        expect(rows.map(row => row[4])).toEqual([1,4,5,5,5,5,5,5,5,5,5,5,5,9]);

    });

    test('filter exclude all', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: IN, colName: 'Group 1', values: []});
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(0);
        expect(rows).toEqual([])
    });

    test('multiple filters', () => {
        const rowSet = getInstrumentRowset();
        rowSet.filter({colName: 'Industry', type: IN, values: ['Electronic Components']})
        expect(rowSet.stats).toEqual({
            totalRowCount: 1247,
            totalSelected: 0,
            filteredRowCount: 15,
            filteredSelected: 0
        });

        const filterRowset = rowSet.getDistinctValuesForColumn({name: 'Sector'});
        filterRowset.selectAll();
        filterRowset.filter({colName: 'count', type: GREATER_THAN, value: 0});

        const {stats} = filterRowset.setRange({lo:0, hi:10}, true, true);
        expect(stats).toEqual({
            totalRowCount: 12,
            totalSelected: 12,
            filteredRowCount: 4,
            filteredSelected: 4
        });

    })

});

describe('clearFilter', () => {

    test('removes simple filter', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        rowSet.clearFilter()
        const {size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(24);
    });

    test('sort applied before filter is preserved when filter is removed', () => {
        const rowSet = getTestRowset();
        rowSet.sort([['Price', 'asc']])
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        rowSet.clearFilter()
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(24);
        expect(rows.map(row => row[4])).toEqual([1,4,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,9]);
    })

    test('sort applied after filter is preserved when filter is removed', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        rowSet.sort([['Price', 'asc']])
        rowSet.clearFilter()
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25})
        expect(size).toBe(24);
        expect(rows.map(row => row[4])).toEqual([1,4,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,9]);
    })

    test('sort applied after filter is preserved when new filter is applied', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'EQ',colName: 'Qty',value: 100});
        rowSet.sort([['Group 2', 'asc']])
        rowSet.filter({type: 'EQ',colName: 'Price',value: 5});
        const {rows, size} = rowSet.setRange({lo: 0, hi: 25});
        expect(size).toBe(21);
        expect(rows.map(row => row[2])).toEqual([
            'A2','A2','E2','E2','E2','E2',
            'I2','I2','I2','I2','I2',
            'O2','O2','O2','O2','O2',
            'U2','U2','U2','U2','U2'
        ]);
    })
});

describe('insert', () => {

    test('no sort, no filter, viewport at head', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET);
        rowSet.setRange({lo: 0, hi: 10});

        const row = ['key25','G1','I2','T5',6, 112];
        table.insert(row)
        const results = rowSet.insert(24, table.rows[24]);

        expect(results).toEqual({
            size: 25
        });
        expect(rowSet.size).toBe(25);
        expect(rowSet.sortSet.length).toBe(25);
        expect(rowSet.sortSet[24][0]).toBe(24);
    })

    test('no sort, no filter, viewport at end', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET)
        rowSet.setRange({lo: 0, hi: 30});

        const row = ['key25','G1','I2','T5',6, 112];
        table.insert(row)
        const results = rowSet.insert(24, table.rows[24]);

        expect(results).toEqual({
            size: 25,
            replace: true
        });

        const {rows,size} = rowSet.setRange({lo: 0, hi: 30},false);
        expect(size).toBe(25);
        expect(rows[24]).toEqual(['key25','G1','I2','T5',6,112,124,0,0,0,'key25', 0]);

    });

    test('sorted rowset, no filter, insert at end, viewport at head', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET);
        rowSet.sort([['Group 1', 'asc']]);
        rowSet.setRange({lo: 0, hi: 10});

        const row = ['key25','G3','I2','T5',6, 112];
        table.insert(row)
        const results = rowSet.insert(24, table.rows[24]);

        expect(results).toEqual({
            size: 25
        });
        expect(rowSet.sortSet[24][0]).toEqual(24)

    });

    test('sorted rowset, no filter, insert after viewport, viewport at head', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET);
        rowSet.sort([['Group 1', 'asc']]);
        rowSet.setRange({lo: 0, hi: 10});

        const row = ['key25','G2','I2','T5',6, 112];
        table.insert(row)
        const results = rowSet.insert(24, table.rows[24]);

        expect(results).toEqual({
            size: 25
        });

        expect(rowSet.sortSet.map(row => row[1])).toEqual([
            'G1','G1','G1','G1','G1','G1','G1','G1',
            'G2','G2','G2','G2','G2','G2','G2','G2','G2',
            'G3','G3','G3','G3','G3','G3','G3','G3']);
        expect(rowSet.sortSet[16]).toEqual([24,'G2']);
    });

    test('sorted rowset, no filter, insert into viewport', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET);
        rowSet.sort([['Group 1', 'asc']]);
        rowSet.setRange({lo: 0, hi: 10});

        const row = ['key25','G1','I2','T5',6, 112];
        table.insert(row)
        const results = rowSet.insert(24, table.rows[24]);

        expect(results).toEqual({
            size: 25,
            replace: true
        });
        const {rows} = rowSet.setRange({lo: 0, hi: 10},false);

        expect(rows[8]).toEqual(
            ['key25','G1','I2','T5',6,112, 108,0,0,0,'key25', 0]);

    });

    test('sorted rowset, no filter, insert before viewport', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET);
        rowSet.sort([['Group 1', 'asc']]);
        rowSet.setRange({lo: 10, hi: 20});

        const row = ['key25','G1','I2','T5',6, 112];
        table.insert(row)
        const results = rowSet.insert(24, table.rows[24]);

        expect(results).toEqual({
            size: 25,
            offset: 99
        });
    });

    test('filtered rowset, no sort, insert into viewport', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET);
        rowSet.filter({type: 'LT',colName: 'Qty',value: 100});
        let {rows,size} = rowSet.setRange({lo: 0, hi: 10});
        expect(size).toBe(4);

        const row = ['key25','G1','I2','T5',6, 88];
        table.insert(row)
        const results = rowSet.insert(24, table.rows[24]);

        expect(results).toEqual({
            size: 5,
            replace: true
        });
        ({rows} = rowSet.setRange({lo: 0, hi: 10},false));
        expect(rows[4]).toEqual(['key25', 'G1','I2','T5',6, 88, 104,0,0,0,'key25', 0])

    });

});


describe('update', () => {

    test('no sort, no filter, viewport at head, update within viewport', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET)
        rowSet.setRange({lo: 0, hi: 10});

        table.update(0,6,10,7,120);
        const result = rowSet.update(0, [6,10,7,120]);
        expect(result).toEqual([100,6,10,7,120])
    })

    test('no sort, no filter, viewport at head, update outside viewport', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET)
        rowSet.setRange({lo: 0, hi: 10});

        table.update(15,6,10,7,120);
        const result = rowSet.update(15, [6,10,7,120]);
        expect(result).toBeUndefined();
    })

    test('sorted, no filter, viewport at head, update outside viewport, then within viewport', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET)
        rowSet.sort([['Group 1', 'dsc']]);        
        rowSet.setRange({lo: 0, hi: 10});
        table.update(0,6,10,7,120);
        let result = rowSet.update(0, [6,10,7,120]);
        expect(result).toBeUndefined();
        table.update(16,6,10,7,120);
        result = rowSet.update(16, [6,10,7,120]);
        // this might be inpredictable, sort is unstable
        expect(result).toEqual([100,6,10,7,120]);
    })

    test('filter applied, no sort, viewport at head, update to rows inside and outside filter', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET)
        rowSet.filter({type: 'GE',colName: 'Qty',value: 100});
        rowSet.setRange({lo: 0, hi: 10});

        table.update(5,6,10,7,120);
        let result = rowSet.update(5, [6,10,7,120]);
        expect(result).toBeUndefined();

        table.update(1,6,10,7,120);
        result = rowSet.update(1, [6,10,7,120]);
        expect(result).toEqual([101,6,10,7,120]);
    })

    test('filter and sort applied, no sort, viewport at head, update to rows inside and outside filter', () => {
        const table = getTestTable();
        const rowSet = new RowSet(table, rowset_columns, DEFAULT_OFFSET)
        rowSet.filter({type: 'GE',colName: 'Qty',value: 100});
        rowSet.sort([['Group 1','dsc']])
        rowSet.setRange({lo: 0, hi: 10});

        table.update(5,6,10,7,120);
        let result = rowSet.update(5, [6,10,7,120]);
        expect(result).toBeUndefined();

        table.update(1,6,10,7,120);
        result = rowSet.update(1, [6,10,7,120]);
        expect(result).toBeUndefined();

        table.update(18,6,10,7,120);
        result = rowSet.update(18, [6,10,7,120]);
        expect(result).toEqual([102,6,10,7,120]);
    })

});

describe('getDistinctValuesForColumn', () => {
    test('no current filter in place', () => {
        const rowSet = getTestRowset();
        const filterRowset = rowSet.getDistinctValuesForColumn({name: 'Group 3'});
        const {rows} = filterRowset.setRange({lo: 0,hi: 25});
        expect(rows).toEqual([
            ['T3', 20, 20, 0, 0, 0, 0, 'T3', 0],
            ['T4', 3,  3,  1, 0, 0, 0, 'T4', 0],
            ['T5', 1,  1,  2, 0, 0, 0, 'T5', 0]
        ])
    });

    test('with filter on current column', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: IN, colName: 'Group 3',values: ['T3']})
        const filterRowset = rowSet.getDistinctValuesForColumn({name: 'Group 3'});
        const {rows} = filterRowset.setRange({lo: 0,hi: 25});
        expect(rows).toEqual([
            ['T3', 20, 20,  0, 0, 0, 0, 'T3', 0],
            ['T4', 0,  3,   1, 0, 0, 0, 'T4', 0],
            ['T5', 0,  1,   2, 0, 0, 0, 'T5', 0]
        ])
    });

    test('with filter on another column', () => {
        const rowSet = getTestRowset();
        rowSet.filter({type: 'NOT_IN', colName: 'Group 2',values: ['I2']})
        const filterRowset = rowSet.getDistinctValuesForColumn({name: 'Group 3'});
        const {rows} = filterRowset.setRange({lo: 0,hi: 25});

        expect(rows).toEqual([
            ['T3', 15, 20, 0, 0, 0, 0, 'T3', 0],
            ['T4', 2,  3,  1, 0, 0, 0, 'T4', 0],
            ['T5', 0,  1,  2, 0, 0, 0, 'T5', 0]
        ])
    });

    test('with filters on both another column and current column', () => {
        const rowSet = getTestRowset();
        rowSet.filter({
            type: 'AND',
            filters: [
                {type: 'EQ', colName: 'Group 1', value: 'G1'},
                {type: 'NOT_IN', colName: 'Group 2',values: ['I2']}
            ]}
        );

        const filterRowset = rowSet.getDistinctValuesForColumn({name: 'Group 1'});
        const {rows} = filterRowset.setRange({lo: 0,hi: 25});
        expect(rows).toEqual([
            ['G1', 4, 8,   0, 0, 0, 0, 'G1', 0],
            ['G2', 0, 8,   1, 0, 0, 0, 'G2', 0],
            ['G3', 0, 8,   2, 0, 0, 0, 'G3', 0]
        ])
    });

    test('check filter counts against distinct value counts', () => {
        const rowSet = getInstrumentRowset();
        let {rows} = rowSet.setRange({lo: 0, hi: 17});

        const filterRowset = rowSet.getDistinctValuesForColumn({name: 'Industry'});
        ({rows} = filterRowset.setRange({lo: 0,hi: 25}));

        expect(rows[0]).toEqual(['Advertising',10, 10, 0,0,0,0,'Advertising', 0])

        rowSet.filter({type: IN, colName: 'Industry', values: []});
        ({rows} = rowSet.setRange({lo: 0,hi: 17}, false));

        rowSet.filter({type: IN, colName: 'Industry', values: ['Advertising']});
        ({rows} = rowSet.setRange({lo: 0,hi: 17},false));

        expect(rows).toEqual([
            ['AMCN','AirMedia Group Inc',2.28,135810000,'2007','Technology','Advertising',100,0,0,0,'AMCN',0],
            ['ANGI','Angie&#39;s List, Inc.',5.02,293750000,'2011','Consumer Services','Advertising',101,0,0,0,'ANGI',0],
            ['CTCT','Constant Contact, Inc.',42.48,1350000000,'2007','Technology','Advertising',102,0,0,0,'CTCT',0],
            ['CRTO','Criteo S.A.',40.7,2410000000,'2013','Technology','Advertising',103,0,0,0,'CRTO',0],
            ['GRPN','Groupon, Inc.',7.97,5350000000,'2011','Technology','Advertising',104,0,0,0,'GRPN',0],
            ['ISIG','Insignia Systems, Inc.',3.19,39220000,'1991','Consumer Services','Advertising',105,0,0,0,'ISIG',0],
            ['NCMI','National CineMedia, Inc.',14.92,908190000,'2007','Consumer Services','Advertising',106,0,0,0,'NCMI',0],
            ['RLOC','ReachLocal, Inc.',3.58,104410000,'2010','Technology','Advertising',107,0,0,0,'RLOC',0],
            ['SALE','RetailMeNot, Inc.',16.41,887230000,'2013','Consumer Services','Advertising',108,0,0,0,'SALE',0],
            ['VISN','VisionChina Media, Inc.',12.9,65510000,'2007','Technology','Advertising',109,0,0,0,'VISN',0]
        ])

    });

});

describe('select', () => {
    test('select single row, from no selection', () => {
        const rowSet = getTestRowset();
        rowSet.setRange({lo: 0, hi: 10});
        let result = rowSet.select(0, /* rangeSelect */ false, /*keepExistingSelection */ false);
        expect(result).toEqual([[100,11,1]])
        let {rows} = rowSet.setRange({lo: 0, hi: 10}, false);
        const {SELECTED} = rowSet.meta;
        expect(rows.map(row => row[SELECTED])).toEqual([1,0,0,0,0,0,0,0,0,0])
    })

    test('select single row, extend to range', () => {
        const rowSet = getTestRowset();
        rowSet.setRange({lo: 0, hi: 10});
        rowSet.select(0, /* rangeSelect */ false, /*keepExistingSelection */ false);
        let result = rowSet.select(15, /* rangeSelect */ true, /*keepExistingSelection */ true);
        expect(result).toEqual([
            [101,11,1],
            [102,11,1],
            [103,11,1],
            [104,11,1],
            [105,11,1],
            [106,11,1],
            [107,11,1],
            [108,11,1],
            [109,11,1],
        ])
        const {SELECTED} = rowSet.meta;
        let {rows} = rowSet.setRange({lo: 0, hi: 10}, false);
        expect(rows.map(row => row[SELECTED])).toEqual([1,1,1,1,1,1,1,1,1,1]);

        ({rows} = rowSet.setRange({lo: 10, hi: 20}));
        expect(rows.map(row => row[SELECTED])).toEqual([1,1,1,1,1,1,0,0,0,0]);

    })

    test('select single row, select other row, dont preserve selection', () => {
        const rowSet = getTestRowset();
        rowSet.setRange({lo: 0, hi: 10});
        rowSet.select(0, /* rangeSelect */ false, /*keepExistingSelection */ false);
        let result = rowSet.select(2, /* rangeSelect */ false, /*keepExistingSelection */ false);

        expect(result).toEqual([
            [102,11,1],
            [100,11,0],
        ])
        const {SELECTED} = rowSet.meta;
        let {rows} = rowSet.setRange({lo: 0, hi: 10}, false);
        expect(rows.map(row => row[SELECTED])).toEqual([0,0,1,0,0,0,0,0,0,0]);

    })

});

describe('selectAll', () => {
    test('no previous selection', () => {
        const rowSet = getTestRowset();
        rowSet.setRange({lo: 0, hi: 10});
        let result = rowSet.selectAll();

        expect(result).toEqual([
            [100,11,1],
            [101,11,1],
            [102,11,1],
            [103,11,1],
            [104,11,1],
            [105,11,1],
            [106,11,1],
            [107,11,1],
            [108,11,1],
            [109,11,1],
        ])
        const {SELECTED} = rowSet.meta;
        let {rows} = rowSet.setRange({lo: 0, hi: 10}, false);
        expect(rows.map(row => row[SELECTED])).toEqual([1,1,1,1,1,1,1,1,1,1]);

        ({rows} = rowSet.setRange({lo: 10, hi: 20}, false));
        expect(rows.map(row => row[SELECTED])).toEqual([1,1,1,1,1,1,1,1,1,1]);

    })

});


describe('selectNone', () => {

    test('selectAll, then selectNone', () => {
        const rowSet = getTestRowset();
        rowSet.setRange({lo: 0, hi: 10});

        rowSet.selectAll();
        let result = rowSet.selectNone();

        expect(result).toEqual([
            [100,11,0],
            [101,11,0],
            [102,11,0],
            [103,11,0],
            [104,11,0],
            [105,11,0],
            [106,11,0],
            [107,11,0],
            [108,11,0],
            [109,11,0],
        ])
        const {SELECTED} = rowSet.meta;
        let {rows} = rowSet.setRange({lo: 0, hi: 10}, false);
        expect(rows.map(row => row[SELECTED])).toEqual([0,0,0,0,0,0,0,0,0,0]);

    })


});
