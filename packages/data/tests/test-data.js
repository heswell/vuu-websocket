const {Table, RowSet} = require('./dist/index.js');
const instrumentData = require('./test-fixtures/instrumentData.js');

const DEFAULT_OFFSET = 100;

const GROUP_COL_1 = ['Group 1','asc'];
const GROUP_COL_2 = ['Group 2','asc'];
const GROUP_COL_3 = ['Group 3','asc'];

const columns = [
  { name: 'Key Col', key: 0 },
  { name: 'Group 1', key: 1 },
  { name: 'Group 2', key: 2 },
  { name: 'Group 3', key: 3 },
  { name: 'Price', key: 4 },
  { name: 'Qty', key: 5 }
];

const columns_with_aggregation = [
  { name: 'Key Col' },
  { name: 'Group 1' },
  { name: 'Group 2' },
  { name: 'Group 3' },
  { name: 'Price', aggregate: 'avg' },
  { name: 'Qty', aggregate: 'sum' }
];

const _data = [
  ['key01', 'G1', 'U2', 'T3', 5, 101],  // [0]
  ['key02', 'G1', 'U2', 'T3', 5, 102],  // [1]
  ['key03', 'G1', 'U2', 'T4', 4, 100],  // [2]
  ['key04', 'G1', 'U2', 'T4', 5, 99],   // [3]
  ['key05', 'G1', 'I2', 'T3', 9, 100],  // [4]
  ['key06', 'G1', 'I2', 'T3', 5, 45],   // [5]
  ['key07', 'G1', 'I2', 'T4', 1, 100],  // [6]
  ['key08', 'G1', 'I2', 'T5', 5, 102],  // [7]

  ['key09', 'G2', 'U2', 'T3', 5, 100],  // [8]
  ['key10', 'G2', 'U2', 'T3', 5, 100],  // [9]
  ['key11', 'G2', 'I2', 'T3', 5, 100],  // [10]
  ['key12', 'G2', 'I2', 'T3', 5, 100],  // [11]
  ['key13', 'G2', 'O2', 'T3', 5, 100],  // [12]
  ['key14', 'G2', 'O2', 'T3', 5, 100],  // [13]
  ['key15', 'G2', 'O2', 'T3', 5, 100],  // [14]
  ['key16', 'G2', 'O2', 'T3', 5, 100],  // [15]
    // []
  ['key17', 'G3', 'E2', 'T3', 5, 110],  // [16]
  ['key18', 'G3', 'E2', 'T3', 5, 101],  // [17]
  ['key19', 'G3', 'E2', 'T3', 5, 100],  // [18]
  ['key20', 'G3', 'E2', 'T3', 5, 104],  // [19]
  ['key21', 'G3', 'A2', 'T3', 5, 100],  // [20]
  ['key22', 'G3', 'A2', 'T3', 5, 95],   // [21]
  ['key23', 'G3', 'I2', 'T3', 5, 94],   // [22]
  ['key24', 'G3', 'O2', 'T3', 5, 100]   // [23]
]

function getTestTable(data){
  return new Table({
    name: 'TestTable',
    primaryKey: 'Key Col',
    columns: columns,
    data: data || _data.map(d => d.slice())
  });
}

function getTestRowset(){
  const table = getTestTable();
  return new RowSet(table, columns, DEFAULT_OFFSET)
}

function getTestTableAndRowset(){
  const table = getTestTable();
  const rowSet = new RowSet(table, columns, DEFAULT_OFFSET);
  return [table, rowSet]
}

const  instrumentColumns = [
  {name: 'Symbol'},
  {name: 'Name'},
  {name: 'Price', 'type': {name: 'price'}, 'aggregate': 'avg'},
  {name: 'MarketCap', 'type': {name: 'number','format': 'currency'}, 'aggregate': 'sum'},
  {name: 'IPO', 'type': 'year'},
  {name: 'Sector'},
  {name: 'Industry'}
];

const getInstrumentTable = () => new Table({
  name: 'Instruments',
  primaryKey: 'Symbol',
  columns: instrumentColumns,
  data: instrumentData
});

function getInstrumentRowset(){
  const table = getInstrumentTable();
  return new RowSet(table, instrumentColumns, 100)
}

function getEmptyTestTableAndRowset(){
  const table = getTestTable([]);
  const rowSet = new RowSet(table, columns, DEFAULT_OFFSET);
  return [table, rowSet]
}

module.exports = {
  getInstrumentTable,
  getInstrumentRowset,
  getTestTable,
  getTestRowset,
  getTestTableAndRowset,
  getEmptyTestTableAndRowset,
  columns,
  columns_with_aggregation,
  instrumentColumns,
  GROUP_COL_1,
  GROUP_COL_2,
  GROUP_COL_3
}