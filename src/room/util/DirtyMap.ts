export class DirtyMap<K, V> extends Map<K, V> {
    dirty = false;

    clear() {
        this.dirty = true;
        super.clear();
    }

    set(key: K, val: V) {
        this.dirty = true;
        return super.set(key, val);
    }

    delete(key: K) {
        this.dirty = true;
        return super.delete(key);
    }
}

export class DirtySet<V> extends Set<V> {
    dirty = false;

    clear() {
        this.dirty = true;
        super.clear();
    }

    add(value: V) {
        this.dirty = true;
        return super.add(value);
    }

    delete(value: V) {
        this.dirty = true;
        return super.delete(value);
    }
}