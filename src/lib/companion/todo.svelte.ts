/*
 * The to-do list as the companion's window holds it (`todo.ts` for the
 * rules): what a reply's `[[todo: …]]` lines ask, and what the island's card
 * does by hand, kept per core and followed from the other window too.
 */
import { applyTodo, readTodos, subscribeTodos, todoBlock, writeTodos, type TodoItem, type TodoOp } from './todo';

export class Todos {
  items = $state.raw<TodoItem[]>([]);
  private readonly off: () => void;

  /** `core` names the core the list belongs to (`coreKey`). */
  constructor(private readonly core: () => string) {
    this.off = subscribeTodos(() => this.reload());
    this.items = readTodos(core());
  }

  /** Reads the list again: a change from elsewhere, another core, or a new day. */
  reload(): void {
    this.items = readTodos(this.core());
  }

  /** The list, numbered, as a request carries it, read again for a new day; null when it is empty. */
  block(): string | null {
    this.reload();
    return todoBlock(this.items);
  }

  /** Ops a reply asks, numbered as the list the request carried, which is the one held here. */
  apply(ops: readonly TodoOp[], now = Date.now()): void {
    if (ops.length === 0) return;
    const next = applyTodo(this.items, ops, now);
    writeTodos(this.core(), next);
    this.items = next;
  }

  add(text: string): void {
    this.apply([{ kind: 'add', text }]);
  }

  toggle(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) this.apply([{ kind: this.items[index]!.doneAt === null ? 'done' : 'undo', index: index + 1 }]);
  }

  remove(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) this.apply([{ kind: 'remove', index: index + 1 }]);
  }

  clearDone(): void {
    this.apply([{ kind: 'clear', all: false }]);
  }

  dispose(): void {
    this.off();
  }
}
