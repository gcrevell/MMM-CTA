/* Magic Mirror
 * Node Helper: MMM-CTA
 *
 * By Jordan Welch
 * MIT Licensed.
 */

const Log = require('logger');
const NodeHelper = require('node_helper');

module.exports = NodeHelper.create({
  socketNotificationReceived (notification, payload) {
    if (notification !== 'MMM-CTA-FETCH') {
      return;
    }
    if (!this.validate(payload)) {
      return;
    }

    this.getData(payload);
  },

  async getData ({
    trainApiKey,
    busApiKey,
    maxResultsTrain,
    maxResultsBus,
    stops,
  }) {
    const responses = await Promise.all(stops.map(async (stop) => {
      if (stop.type === 'train') {
        return {
          type: 'train',
          name: stop.name,
          arrivals: await this.getTrainData(
            stop.id,
            maxResultsTrain,
            trainApiKey,
            stop.minimumArrivalTime ?? 0,
          ),
        };
      }

      return {
        type: 'bus',
        name: stop.name,
        arrivals: await this.getBusData(
          stop.id,
          maxResultsBus,
          busApiKey,
          stop.minimumArrivalTime ?? 0,
        ),
      };
    }));

    this.sendSocketNotification('MMM-CTA-DATA', {
      stops: responses.flat(),
    });
  },

  async getBusData (id, maxResults, apiKey, minimumArrivalTime) {
    const response = await fetch(this.busUrl(id, maxResults, apiKey));
    const { 'bustime-response': data } = await response.json();
    const minimumArrivalTimeMinutes = minimumArrivalTime / 1000 / 60;

    if (!data?.prd) {
      return [];
    }

    return data.prd.filter((bus) => {
      return bus.prdctdn >= minimumArrivalTimeMinutes;
    }).map((bus) => ({
      route: bus.rt,
      direction: bus.rtdir,
      arrival: bus.prdctdn,
    }));
  },

  async getTrainData (id, maxResults, apiKey, minimumArrivalTime) {
    const response = await fetch(this.trainUrl(id, maxResults, apiKey));
    const { ctatt: data } = await response.json();

    if (!data?.eta) {
      return [];
    }

    return data.eta.filter((train) => {
      const arrivalTime = new Date(train.arrT);

      return arrivalTime - Date.now() > minimumArrivalTime;
    }).map((train) => ({
      direction: train.destNm,
      routeColor: this.routeToColor(train.rt),
      time: new Date(train.arrT),
    }));
  },

  validate (payload) {
    const required = [/** TODO: Add Required */];

    return this.validateRequired(payload, required);
  },

  validateRequired (payload, required) {
    let valid = true;
    required.forEach((req) => {
      if (!payload[req]) {
        Log.error(`MMM-CTA: Missing ${req} in config`);
        valid = false;
      }
    });

    return valid;
  },

  busUrl (id, maxResults, apiKey) {
    const baseUrl = 'http://www.ctabustracker.com/bustime/api/v2/getpredictions';

    return `${baseUrl}?key=${apiKey}&stpid=${id}&top=${maxResults}&format=json`;
  },

  trainUrl (id, maxResults, apiKey) {
    const baseUrl = 'http://lapi.transitchicago.com/api/1.0/ttarrivals.aspx';

    return `${baseUrl}?key=${apiKey}&mapid=${id}&max=${maxResults}&outputType=json`; // eslint-disable-line @stylistic/max-len
  },

  routeToColor (route) {
    return {
      Red: 'red',
      Blue: 'blue',
      Brn: 'brown',
      G: 'green',
      Org: 'orange',
      P: 'purple',
      Pink: 'pink',
      Y: 'yellow',
    }[route] || 'gray';
  },
});
