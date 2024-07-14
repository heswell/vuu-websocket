const {
  columnUtils: {
    mapSortCriteria,
    buildColumnMap,
    projectColumns,
    toColumn,
    getFilterType,
    metaData
  }
} = require('../dist/index.js');

describe('columnUtils', () => {

  describe('mapSortCriteria', () => {
    test('map simple column names', () => {
      const columnMap = {
        'Col 1': 0,
        'Col 2': 1,
        'Col 3': 2
      }

      expect(mapSortCriteria(['Col 1'],columnMap)).toEqual([[0,'asc']])
      expect(mapSortCriteria(['Col 1', 'Col 3'],columnMap)).toEqual([[0,'asc'],[2,'asc']])
      expect(mapSortCriteria([['Col 1','dsc']],columnMap)).toEqual([[0,'dsc']])
      expect(mapSortCriteria([['Col 3'],['Col 1', 'dsc']],columnMap)).toEqual([[2,'asc'],[0,'dsc']])
    })
  })

  describe('buildColumnMap', () => {

    test('simple array of strings', () => {
      expect(buildColumnMap(['Col 1', 'Col 2', 'Col 3'])).toEqual({
        'Col 1': 0,
        'Col 2': 1,
        'Col 3': 2
      })
    })

    test('named columns, no keys', () => {
      expect(buildColumnMap([{name:'Col 1'}, {name:'Col 2'}, {name:'Col 3'}])).toEqual({
        'Col 1': 0,
        'Col 2': 1,
        'Col 3': 2
      })
    })

    test('preserves existing keys', () => {
      expect(buildColumnMap([{name:'Col 1', key: 1}, {name:'Col 2', key: 0}, {name:'Col 3', key : 2}])).toEqual({
        'Col 1': 1,
        'Col 2': 0,
        'Col 3': 2
      })
    })

    test('mix named columns and strings', () => {
      expect(buildColumnMap(['Col 1', {name:'Col 2'}, 'Col 3'])).toEqual({
        'Col 1': 0,
        'Col 2': 1,
        'Col 3': 2
      })
    })

  })

  describe('projectColumns', () => {

    const map = {'Col 1': 0, 'Col 2': 1, 'Col 3': 2 }
    const rows = [
      ['100', '200', '300'],
      ['101', '201', '301'],
      ['102', '202', '302'],
      ['103', '203', '303']
    ]

    test('project all columns', () => {

      const columns = [{name:'Col 1'}, {name:'Col 2'}, {name:'Col 3'}];
      const meta = metaData(columns)

      const project = projectColumns(map, columns, meta)
      const results = rows.map(project(0, 100))
      expect(results).toEqual([
        ['100', '200', '300', 100, 0, 0, 0, '100', 0],
        ['101', '201', '301', 101, 0, 0, 0, '101', 0],
        ['102', '202', '302', 102, 0, 0, 0, '102', 0],
        ['103', '203', '303', 103, 0, 0, 0, '103', 0]
      ])
    })

    test('project just one column', () => {
      const columns = [{name:'Col 3'}];
      const meta = metaData(columns)

      const project = projectColumns(map, columns, meta)
      const results = rows.map(project(0, 100))
      expect(results).toEqual([
        ['300', 100, 0, 0, 0, '100', 0],
        ['301', 101, 0, 0, 0, '101', 0],
        ['302', 102, 0, 0, 0, '102', 0],
        ['303', 103, 0, 0, 0, '103', 0]
      ])
    })
  });

  describe('toColumn', () => {
    test('converts simple string to struct', () => {
      expect(toColumn('Col 1')).toEqual({name: 'Col 1'})
    })
    test('returns column object as-is', () => {
      const col = {name: 'Col 2'}
      expect(toColumn(col)).toEqual(col)
    })
  });

  describe('getFilterType', () => {
    test('explicit filter returned', () => {
      expect(getFilterType({filter: 'date'})).toEqual('date')
    })

    test('default filter is set', () => {
      expect(getFilterType({})).toEqual('set')
    })

    test('string type interpreted as filter', () => {
      expect(getFilterType({type: 'price'})).toEqual('price')
    })

    test('object type expected to have name', () => {
      expect(getFilterType({type: {name: 'qty'}})).toEqual('qty')
    })
  })


  describe('metaData', () => {
    test('correct metadata from columns', () => {
      const results = metaData([{name: 'Col 1'}, {name: 'Col 2'}])

      expect(results).toEqual({
        IDX: 2,
        RENDER_IDX: 3,
        DEPTH: 4,
        COUNT: 5,
        KEY: 6,
        SELECTED: 7,
        PARENT_IDX: 8,
        IDX_POINTER: 9,
        FILTER_COUNT: 10,
        NEXT_FILTER_IDX: 11,
        count: 12
      })

    })
  })


});