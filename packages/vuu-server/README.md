Launching a Vuu Server instance

VuuServer is created with module structure config then start method invoked

VuUServer makes use of a number of global singletons

- moduleContainer
- tableContainer
- joinTableProvider

1. call VuuServerConfig

   - withModule adds a module spec
     - addTable
       - tableDef
       - providerFactory
       - serviceFactory
     - addJoinTable
       - JoinTableFactory

2. VuuServer constructor

   - creates the ProviderContainer
   - registers each module from the config
     - register with moduleContaibner
     - for each tableDef of module
       - set module on tableDef
       - call createTable or createJoinTable
       - call registerProvider (table, provider)
         - register with providerContainer

3. vuuServer.start

- call providerContainer.start
  - for each provider
    - call provider.load
- call moduleContainer.start
  - for each module
    - call module.start (does nothing)
- run the server
  - starts http server, handles websocket messages with ...
    - websocketConnectionHandler, processes ws events:
      - open
        - create session
      - close
        - tear down session
      - message, one of ...
        - HB_RESP
          - set session.incomingHeartBeat
        - LOGIN
          - call session.login
        - other ...
          - call VuuProtocolHandler.messageAPI[messageType]
            - CREATE_VP
            - REMOVE_VP
            - CHANGE_VP

Mocking the VuuServer - provide MockProvider in config
