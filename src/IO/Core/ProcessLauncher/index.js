import Monologue from 'monologue.js';

const PROCESS_READY_TOPIC = 'launcher.process.ready';
const PROCESS_STOPPED_TOPIC = 'launcher.process.stopped';
const CONNECTION_INFO_TOPIC = 'launcher.info.connection';
const ERROR_TOPIC = 'launcher.error';

const connections = [];

// DEPRECATED: replaced by wslink/js/src/ProcessLauncher
export default class ProcessLauncher {
  constructor(endPoint) {
    this.endPoint = endPoint;
  }

  start(config) {
    const xhr = new XMLHttpRequest();
    const url = this.endPoint;

    xhr.open('POST', url, true);
    xhr.responseType = 'json';
    const supportsJson = 'response' in xhr && xhr.responseType === 'json';

    xhr.onload = (e) => {
      const response = supportsJson ? xhr.response : JSON.parse(xhr.response);
      if (xhr.status === 200 && !response.error) {
        // Add connection to our global list
        connections.push(response);
        this.emit(PROCESS_READY_TOPIC, response);
        return;
      }
      this.emit(ERROR_TOPIC, response);
    };

    xhr.onerror = (e) => {
      this.emit(ERROR_TOPIC, xhr.response);
    };

    xhr.send(JSON.stringify(config));
  }

  fetchConnection(sessionId) {
    const xhr = new XMLHttpRequest();
    const url = [this.endPoint, sessionId].join('/');

    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    const supportsJson = 'response' in xhr && xhr.responseType === 'json';

    xhr.onload = (e) => {
      if (this.status === 200) {
        this.emit(
          CONNECTION_INFO_TOPIC,
          supportsJson ? xhr.response : JSON.parse(xhr.response)
        );
        return;
      }
      this.emit(ERROR_TOPIC, xhr.response);
    };

    xhr.onerror = (e) => {
      this.emit(ERROR_TOPIC, xhr.response);
    };

    xhr.send();
  }

  stop(connection) {
    const xhr = new XMLHttpRequest();
    const url = [this.endPoint, connection.id].join('/');

    xhr.open('DELETE', url, true);
    xhr.responseType = 'json';
    const supportsJson = 'response' in xhr && xhr.responseType === 'json';

    xhr.onload = (e) => {
      if (this.status === 200) {
        const response = supportsJson ? xhr.response : JSON.parse(xhr.response);
        // Remove connection from the list
        // FIXME / TODO
        this.emit(PROCESS_STOPPED_TOPIC, response);
        return;
      }
      this.emit(ERROR_TOPIC, xhr.response);
    };
    xhr.onerror = (e) => {
      this.emit(ERROR_TOPIC, xhr.response);
    };
    xhr.send();
  }

  /* eslint-disable class-methods-use-this */
  listConnections() {
    return connections;
  }

  onProcessReady(callback) {
    return this.on(PROCESS_READY_TOPIC, callback);
  }

  onProcessStopped(callback) {
    return this.on(PROCESS_STOPPED_TOPIC, callback);
  }

  onFetch(callback) {
    return this.on(CONNECTION_INFO_TOPIC, callback);
  }

  onError(callback) {
    return this.on(ERROR_TOPIC, callback);
  }

  destroy() {
    this.off();
    this.endPoint = null;
  }
}
Monologue.mixInto(ProcessLauncher);
