const MAX_LISTENERS = 10;

export class EventEmitter {
  constructor() {
    this._events = {};
    this._maxListeners = MAX_LISTENERS;
  }

  addListener(type, listener) {
    let m;

    if (!isFunction(listener)) {
      throw TypeError('listener must be a function');
    }

    if (!this._events) {
      this._events = {};
    }

    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (this._events.newListener) {
      this.emit('newListener', type, listener);
    }

    if (!this._events[type]) {
      // Optimize the case of one listener. Don't need the extra array object.
      this._events[type] = listener;
    } else if (Array.isArray(this._events[type])) {
      // If we've already got an array, just append.
      this._events[type].push(listener);
    } else {
      // Adding the second element, need to change to array.
      this._events[type] = [this._events[type], listener];
    }

    // Check for listener leak
    if (Array.isArray(this._events[type]) && !this._events[type].warned) {
      if (!isUndefined(this._maxListeners)) {
        m = this._maxListeners;
      } else {
        m = MAX_LISTENERS;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error(
          '(node) warning: possible EventEmitter memory ' +
            'leak detected. %d listeners added. ' +
            'Use emitter.setMaxListeners() to increase limit.',
          this._events[type].length
        );
      }
    }

    return this;
  }

  removeListener(type, listener) {
    let list, position, length, i;

    if (!isFunction(listener)) {
      throw TypeError('listener must be a function');
    }

    if (!this._events || !this._events[type]) {
      return this;
    }

    list = this._events[type];
    length = list.length;
    position = -1;

    if (list === listener || (isFunction(list.listener) && list.listener === listener)) {
      delete this._events[type];
      if (this._events.removeListener) {
        this.emit('removeListener', type, listener);
      }
    } else if (Array.isArray(list)) {
      for (i = length; i-- > 0; ) {
        if (list[i] === listener || (list[i].listener && list[i].listener === listener)) {
          position = i;
          break;
        }
      }

      if (position < 0) {
        return this;
      }

      if (list.length === 1) {
        list.length = 0;
        delete this._events[type];
      } else {
        list.splice(position, 1);
      }

      if (this._events.removeListener) {
        this.emit('removeListener', type, listener);
      }
    }

    return this;
  }

  removeAllListeners(type) {
    if (!this._events) {
      return this;
    }

    const listeners = this._events[type];

    if (isFunction(listeners)) {
      this.removeListener(type, listeners);
    } else if (listeners) {
      // LIFO order
      while (listeners.length) {
        this.removeListener(type, listeners[listeners.length - 1]);
      }
    }
    delete this._events[type];

    return this;
  }

  emit(type, ...args) {
    if (!this._events) {
      this._events = {};
    }

    // If there is no 'error' event listener then throw.
    if (type === 'error') {
      if (!this._events.error || (isObject(this._events.error) && !this._events.error.length)) {
        const err = arguments[1];
        if (err instanceof Error) {
          throw err; // Unhandled 'error' event
        } else {
          // At least give some kind of context to the user
          throw new Error('Uncaught, unspecified "error" event. (' + err + ')');
        }
      }
    }

    const handler = this._events[type];

    if (isUndefined(handler)) {
      return false;
    }

    if (isFunction(handler)) {
      switch (args.length) {
        // fast cases
        case 0:
          handler.call(this);
          break;
        case 1:
          handler.call(this, type, args[0]);
          break;
        case 2:
          handler.call(this, type, args[0], args[1]);
          break;
        // slower
        default:
          handler.call(this, type, ...args);
      }
    } else if (Array.isArray(handler)) {
      handler.slice().forEach((listener) => listener.call(this, type, ...args));
    }

    return true;
  }

  once(type, listener) {
    const handler = (evtName, message) => {
      this.removeListener(evtName, handler);
      listener(evtName, message);
    };

    this.on(type, handler);
  }

  on(type, listener) {
    return this.addListener(type, listener);
  }
}

function isFunction(arg) {
  return typeof arg === 'function';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}
