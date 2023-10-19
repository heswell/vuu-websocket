import UUID from 'pure-uuid';

export function uuid() {
  return new UUID(1).format();
}
