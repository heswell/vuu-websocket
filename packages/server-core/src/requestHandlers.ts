import { ServerConfig, VuuRequestHandler } from "@heswell/server-types";
import { MessageQueue } from "./messageQueue";

interface ConfiguredService {
  configure: (config: ServerConfig) => void;
  unsubscribeAll?: (sessionId: string, queue: MessageQueue) => void;
}

type MessageType = string;
type ServiceHandlers = Record<MessageType, VuuRequestHandler>;

type ServiceAPI = ConfiguredService & ServiceHandlers;

const _services: { [serviceName: string]: ServiceAPI } = {};

// Map message types to the name of the service that should handle these messages
const _messageTypeToServiceNameMap: { [messageType: string]: string } = {};

export function configureRequestHandlers(config: ServerConfig) {
  config.services.forEach(async ({ name: serviceName, module }) => {
    // TODO roll these up into async functions we can invoke in parallel
    const service: ServiceAPI = await import(module);
    _services[serviceName] = service;
    Object.keys(service)
      .filter((name) => name !== "default")
      .forEach((name) => {
        _messageTypeToServiceNameMap[name] = serviceName;
      });
    // do we have to wait ?
    await service.configure(config);

    console.log(`supported message types `, _messageTypeToServiceNameMap);
  });
}

export function getHandlerForMessage(messageType: string) {
  const serviceName = _messageTypeToServiceNameMap[messageType];
  if (serviceName) {
    return _services[serviceName][messageType];
  }
}

export function killSubscriptions(sessionId: string, queue: MessageQueue) {
  Object.keys(_services).forEach((serviceName) => {
    const service = _services[serviceName] as ConfiguredService;
    if (service) {
      service.unsubscribeAll?.(sessionId, queue);
    }
  });
}
