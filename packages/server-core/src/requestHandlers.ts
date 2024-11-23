import {
  ConfiguredService,
  DataTableAPI,
  DataTableService,
  RestHandler,
  ServerConfig,
  VuuProtocolHandler,
} from "@heswell/server-types";
import { MessageQueue } from "./messageQueue";

type HandlerIdentifier = string;
export type ServiceHandlers<
  H extends VuuProtocolHandler | RestHandler = VuuProtocolHandler | RestHandler
> = Record<HandlerIdentifier, H>;

type ServiceAPI = {
  messageAPI: ServiceHandlers;
  serviceAPI: ConfiguredService | DataTableService;
};

const _serviceAPI: ConfiguredService[] = [];
const _serviceHandlers: { [serviceName: string]: ServiceHandlers } = {};

// Map message types to the name of the service that should handle these messages
const _messageTypeToServiceNameMap: { [messageType: string]: string } = {};

export async function configureRequestHandlers(
  config: ServerConfig,
  // TODO do we still need this ?
  tableService?: DataTableAPI
): Promise<undefined> {
  const {
    service: { name: serviceName, module },
  } = config;
  const { messageAPI, serviceAPI }: ServiceAPI = await import(module);
  _serviceHandlers[serviceName] = messageAPI;
  Object.keys(messageAPI)
    .filter((name) => name !== "default")
    .forEach((name) => {
      // console.log(`register handler ${name} from service ${serviceName}`);
      _messageTypeToServiceNameMap[name] = serviceName;
    });
  // do we have to wait ?
  await serviceAPI.configure({
    ...config,
    TableService: tableService,
  });
  _serviceAPI.push(serviceAPI);
}

export function getRestHandler(handlerIdentifier: string): RestHandler {
  const serviceName = _messageTypeToServiceNameMap[handlerIdentifier];
  const service = _serviceHandlers[serviceName]?.[
    handlerIdentifier
  ] as RestHandler;
  if (service) {
    return service;
  } else {
    throw Error(`no rest handler found for '${handlerIdentifier}'`);
  }
}

export function getHandlerForMessage(messageType: string) {
  const serviceName = _messageTypeToServiceNameMap[messageType];
  if (serviceName) {
    return _serviceHandlers[serviceName][messageType];
  }
}

export function killSubscriptions(sessionId: string, queue: MessageQueue) {
  _serviceAPI.forEach((service) => service.unsubscribeAll?.(sessionId, queue));
}
