const {
  filter: {
    AND,
    OR,
    GREATER_EQ,
    LESS_EQ,
    IN,
    NOT_IN,
    EQUALS,
    STARTS_WITH,
    NOT_STARTS_WITH,
    addFilter,
    extendsFilter,
    extractFilterForColumn,
    includesNoValues
  }
} = require('../dist/index.js');

describe('filter', () => {

  describe('filterRows', () => {

  });

  describe('includesNoValues', () => {
    const EMPTY_IN = {type: IN, values: []};

    test('null filter returns false', () => {
      expect(includesNoValues(null)).toEqual(false)
    });

    test('empty IN filter excludes all', () => {
      expect(includesNoValues(EMPTY_IN)).toEqual(true);
    })

    test('ANDed empty IN filter excludes all', () => {
      expect(includesNoValues({
        type: AND,
        filters: [
          {type: 'EQ', value: 'blah'},
          EMPTY_IN
        ]
      })).toEqual(true);
    })
  })

  describe('extendsFilter', () => {

    test('filter always extends a null filter', () => {
      expect(extendsFilter(null, {type: EQUALS, value: 'blah'})).toEqual(true);
    })

    test('null filter never extends a filter', () => {
      expect(extendsFilter({type: EQUALS, value: 'blah'}, null)).toEqual(false);
    })

    test('IN filter extends existing IN filter if it only removes values', () => {
      const IN_ABCD = {colName: 'col1', type: IN, values: ['A', 'B', 'C', 'D']}
      const IN_AB = {colName: 'col1', type: IN, values: ['A', 'B']}
      expect(extendsFilter(IN_ABCD, IN_AB)).toEqual(true);
    })

    test('IN filter does not extend existing IN filter if it adds any values', () => {
      const IN_ABCD = {colName: 'col1', type: IN, values: ['A', 'B', 'C', 'D']}
      const IN_AB = {colName: 'col1', type: IN, values: ['A', 'B']};
      const IN_FGH = {colName: 'col1', type: IN, values: ['F', 'G', 'H']};
      expect(extendsFilter(IN_AB, IN_ABCD)).toEqual(false);
      expect(extendsFilter(IN_AB, IN_FGH)).toEqual(false);
    })

    test('NOT_IN filter extends existing NOT_IN filter if it only adds values', () => {
      const IN_ABCD = {colName: 'col1', type: NOT_IN, values: ['A', 'B', 'C', 'D']}
      const IN_AB = {colName: 'col1', type: NOT_IN, values: ['A', 'B']}
      expect(extendsFilter(IN_ABCD, IN_AB)).toEqual(false);
      expect(extendsFilter(IN_AB, IN_ABCD)).toEqual(true);
    })

    test('NOT_IN filter does not extend existing NOT_IN filter if any values are removed', () => {
      const IN_AB = {colName: 'col1', type: NOT_IN, values: ['A', 'B']};
      const IN_AFGH = {colName: 'col1', type: IN, values: ['A', 'F', 'G', 'H']};
      expect(extendsFilter(IN_AB, IN_AFGH)).toEqual(false);
    });

    test('STARTS_WITH extends if searchterm extends search term', () => {
      expect(extendsFilter(
        {colName: 'Col1', type: STARTS_WITH, value: 'go'},
        {colName: 'Col1',type: STARTS_WITH, value: 'goo'})).toEqual(true);

        expect(extendsFilter(
          {colName: 'Col1', type: STARTS_WITH, value: 'goo'},
          {colName: 'Col1',type: STARTS_WITH, value: 'go'})).toEqual(false);
    });

    //TODO test ANDED combinbations

  })

  describe('addFilter', () => {
    test('adding to a null filter equals the new filter', () => {
      const filter = {type: EQUALS, value: 'blah'};
      expect(addFilter(null, filter)).toEqual(filter);
    })

    test('adding null filter leaves filter unchanged', () => {
      const filter = {type: EQUALS, value: 'blah'};
      expect(addFilter(filter, null)).toEqual(filter);
    });

    test('filters on different columns are ANDed', () => {
      const f1 = {colName: 'Col1', type: EQUALS, value: 'blah'}
      const f2 = {colName: 'Col2', type: EQUALS, value: 'blah'}
      expect(addFilter(f1,f2)).toEqual({type: AND, filters: [f1, f2]})
    })

    test('same column IN filters are merged', () => {
      const IN_ABCD = {colName: 'Col1', type: IN, values: ['A', 'B', 'C', 'D']}
      const IN_EFGH = {colName: 'Col1', type: IN, values: ['E', 'F', 'G', 'H']}

      expect(addFilter(IN_ABCD, IN_EFGH)).toEqual({
        colName: 'Col1',
        type: IN,
        values: ['A', 'B', 'C', 'D','E', 'F', 'G', 'H']
      })
    })

    test('when same column IN filters are merged, duplicated are dropped', () => {
      const ABCD = {colName: 'Col1', type: IN, values: ['A', 'B', 'C', 'D', 'F']}
      const EFGH = {colName: 'Col1', type: IN, values: ['C', 'E', 'F', 'G', 'H']}

      expect(addFilter(ABCD, EFGH)).toEqual({
        colName: 'Col1',
        type: IN,
        values: ['A', 'B', 'C', 'D','F', 'E', 'G', 'H']
      })
    })

    test('same column NOT_IN filters are merged', () => {
      const ABCD = {colName: 'Col1', type: NOT_IN, values: ['A', 'B', 'C', 'D']}
      const EFGH = {colName: 'Col1', type: NOT_IN, values: ['E', 'F', 'G', 'H']}

      expect(addFilter(ABCD, EFGH)).toEqual({
        colName: 'Col1',
        type: NOT_IN,
        values: ['A', 'B', 'C', 'D','E', 'F', 'G', 'H']
      })
    })

    test('when same column NOT_IN filters are merged, duplicated are dropped', () => {
      const ABCD = {colName: 'Col1', type: NOT_IN, values: ['A', 'B', 'C', 'D', 'F']}
      const EFGH = {colName: 'Col1', type: NOT_IN, values: ['C', 'E', 'F', 'G', 'H']}

      expect(addFilter(ABCD, EFGH)).toEqual({
        colName: 'Col1',
        type: NOT_IN,
        values: ['A', 'B', 'C', 'D','F', 'E', 'G', 'H']
      })
    });

    test('adding an IN value that was previously included in a NOT_IN, removes the NOT_IN entry', () => {
      const includesNotIn = {
        type: 'AND',
        filters: [
          {colName: 'Col1', type: NOT_IN, values: ['A', 'B']},
          {colName: 'otherCol', type: 'EQ', value: 'blah'}
        ]
      }
      const isIn = {colName: 'Col1', type: IN, values: ['A']}

      expect(addFilter(includesNotIn, isIn)).toEqual(
        {
          type: 'AND',
          filters: [
            {colName: 'Col1', type: NOT_IN, values: ['B']},
            {colName: 'otherCol', type: 'EQ', value: 'blah'}
          ]
        })
    })

    test('adding an IN for a previously added NOT_IN removes the NOT_IN entry and removes filter', () => {
      const includesNotIn = {
        type: 'AND',
        filters: [
          {colName: 'Col1', type: NOT_IN, values: ['A']},
          {colName: 'otherCol', type: 'EQ', value: 'blah'}
        ]
      }
      const isIn = {colName: 'Col1', type: IN, values: ['A']}

      expect(addFilter(includesNotIn, isIn)).toEqual(
        {colName: 'otherCol', type: 'EQ', value: 'blah'}
      )
    })

    test('adding a NOT_IN for a previously added IN removes the IN entry', () => {
      const includesIn = {
        type: 'AND',
        filters: [
          {colName: 'Col1', type: IN, values: ['A', 'B', 'C']},
          {colName: 'otherCol', type: 'EQ', value: 'blah'}
        ]
      }
      const notIn = {colName: 'Col1', type: NOT_IN, values: ['A']}

      expect(addFilter(includesIn, notIn)).toEqual(
        {
          type: 'AND',
          filters: [
            {colName: 'Col1', type: IN, values: ['B', 'C']},
            {colName: 'otherCol', type: 'EQ', value: 'blah'}
          ]
        }
      )
    })

    test('adding an exclude all (IN []) filter removes any IN or NOT_IN filters', () => {
      const EXCLUDE_ALL = {colName: 'Col1', type: IN, values: []};

      expect(addFilter({colName: 'Col1', type: NOT_IN, values: ['A','B']}, EXCLUDE_ALL)).toEqual(EXCLUDE_ALL);
      expect(addFilter({colName: 'Col1', type: IN, values: ['A','B']}, EXCLUDE_ALL)).toEqual(EXCLUDE_ALL);

    });

    test('adding an exclude all (IN []) filter removes any ANDED filters for same col', () => {
      const EXCLUDE_ALL = {colName: 'Col1', type: IN, values: []};

      expect(addFilter({
        type: AND,
        filters: [
          {colName: 'Col1', type: STARTS_WITH, value: 'go'},
          {colName: 'Col1', type: STARTS_WITH, value: 'ap'},
        ]}, EXCLUDE_ALL)).toEqual(EXCLUDE_ALL);

    });


    test('adding two STARTS_WITH filters ORs them together', () => {
      const SW_GO = {colName: 'Col1', type: STARTS_WITH, value: 'go'};
      const SW_AP = {colName: 'Col1', type: STARTS_WITH, value: 'ap'};

      expect(addFilter(SW_GO, SW_AP)).toEqual({
        type: OR,
        filters: [SW_GO, SW_AP]
      });

    });

    test('adding two NOT_STARTS_WITH filters ANDs them together', () => {
      const NSW_GO = {colName: 'Col1', type: NOT_STARTS_WITH, value: 'go'};
      const NSW_AP = {colName: 'Col1', type: NOT_STARTS_WITH, value: 'ap'};

      expect(addFilter(NSW_GO, NSW_AP)).toEqual({
        type: AND,
        filters: [NSW_GO, NSW_AP]
      });

    });


  })

  describe('removeFilter', () => {

  })

  describe('includesColumn', () => {
    
  })

  describe('extractFilterForColumn', () => {
    test('top-level filter is ANDed filters for same column', () => {

      const filter = {type: AND, filters: [
        {type: GREATER_EQ, colName: 'Price', value: 2},
        {type: LESS_EQ, colName: 'Price', value: 5}
      ]}

      expect(extractFilterForColumn(filter, 'Price')).toEqual(filter);

    })
  })

  describe('removeFilterForColumn', () => {

  })

  describe('filterEquals', () => {

  })


})