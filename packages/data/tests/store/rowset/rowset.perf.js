
describe('performance tests, large dataset', () => {

      // let instrumentPrices;

      // beforeAll(async() => {
      //     instrumentPrices = await _getInstrumentPricesTable()
      // })

      test('Rowset creation, large dataset', async () => {
          const instrumentPrices = await _getInstrumentPricesTable()
          const t1 = global.performance.now();
          const rowSet = new RowSet(instrumentPrices, InstrumentPriceColumns, 100);
          const t2 = global.performance.now();
          console.log(`Rowset creation: ${t2-t1}ms`)
          expect(rowSet.size).toBe(1042568);
      });

      test('simple sort', async () => {
          const instrumentPrices = await _getInstrumentPricesTable()
          const rowSet = new RowSet(instrumentPrices, InstrumentPriceColumns, 100)
          const t1 = global.performance.now();
          rowSet.sort([['currency', 'asc']])
          const t2 = global.performance.now();
          console.log(`Rowset sort: ${t2-t1}ms`)
          // const {rows} = rowSet.setRange({lo: 0, hi: 10})
          // console.log(`${join(rows)}`)
      })

      test('simple sort, add additional column', async () => {
          const instrumentPrices = await _getInstrumentPricesTable()
          const rowSet = new RowSet(instrumentPrices, InstrumentPriceColumns, 100)
          rowSet.sort([['currency', 'asc']])
          rowSet.sort([['currency', 'asc'],['ric', 'asc']])
          // const {rows} = rowSet.setRange({lo: 0, hi: 25})
          // console.log(`${join(rows)}`)
      });

      test('simple sort, multiple columns', async () => {
          const instrumentPrices = await _getInstrumentPricesTable()
          const rowSet = new RowSet(instrumentPrices, InstrumentPriceColumns, 100)
          rowSet.sort([['currency', 'asc'],['ric', 'asc']])
          // const {rows} = rowSet.setRange({lo: 0, hi: 25})
          // console.log(`${join(rows)}`)
      });

  })
