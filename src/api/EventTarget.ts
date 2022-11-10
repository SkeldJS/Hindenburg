export abstract class EventTarget {
    private loadedEventListeners: {
        eventName: string;
        handler: (...args: any) => any;
    }[];

    constructor() {
        this.loadedEventListeners = [];
    }

    getEventListeners() {
        return this.loadedEventListeners;
    }
}
