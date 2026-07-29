class Node<T> {
	constructor(
		public readonly value: T,
		public next: Node<T> | null = null
	) {}
}

export class CircularBuffer<T> {
	protected _head: Node<T> | null = null;
	protected _tail: Node<T> | null = null;
	protected _size = 0;
	private readonly _capacity: number;

	constructor(capacity: number) {
		this._capacity = capacity;
	}

	protected get head(): Node<T> | null {
		return this._head;
	}

	protected set head(value: Node<T> | null) {
		this._head = value;
	}

	protected get tail(): Node<T> | null {
		return this._tail;
	}

	protected set tail(value: Node<T> | null) {
		this._tail = value;
	}

	public get size(): number {
		return this._size;
	}

	protected set size(value: number) {
		this._size = value;
	}

	public get capacity(): number {
		return this._capacity;
	}

	add(value: T): T | null {
		const newNode = new Node(value);
		let removedValue: T | null = null;

		if (this._size === 0) {
			this._head = this._tail = newNode;
			newNode.next = newNode;
		} else {
			newNode.next = this._head;
			this._tail!.next = newNode;
			this._tail = newNode;
		}

		this._size++;

		if (this._size > this._capacity) {
			removedValue = this._head!.value;
			this._head = this._head!.next;
			this._tail!.next = this._head;
			this._size--;
		}

		return removedValue;
	}

	toArray(): T[] {
		if (!this._head) return [];
		const result: T[] = [];
		let current = this._head;
		do {
			result.push(current.value);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			current = current.next!;
		} while (current !== this._head);
		return result;
	}
}
