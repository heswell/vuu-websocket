export default function dataCollector(value){
  
      switch (typeof value) {
          case 'number': return numberCollector();
          case 'string': return stringCollector();
          default: return stringCollector(); 
      }
  }
  
  // function stringCollector(){
  //     const _values = new Set();
  //     return {
  //         add : value => {
  //             _values.add(value.toLowerCase());
  //         },
  //         values: () => Array.from(_values)
  //     };
  // }
  
  export function stringCollector(adjustCase=true){
      const _keys = {};
      let _count = 0;
      let _total = 0;
  
      return {
          add : value => {
              const v = adjustCase ? value.toLowerCase() : value;
              if (typeof _keys[v] === 'number'){
                  _keys[v] += 1;
              } else {
                  _keys[v] = 1;
                  _count += 1;
              }
              _total += 1;
          },
          values: () => Object.getOwnPropertyNames(_keys).sort().map(key => ({name:key,count:_keys[key]})),
          cardinality: () => _count
      };
  }
  
  function numberCollector(){
  
      return {
          add : (/*value*/) => {
  
          },
          values: () => [],
          counts: ()=> 0,
          cardinality: () =>0
      };
  
  }