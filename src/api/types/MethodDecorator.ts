export type MethodDecorator<K> = (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<K>) => void;
