import { CircularBuffer } from './CircularBuffer';

class Node<T> {
	constructor(
		public value: T,
		public next: Node<T> | null = null
	) {}
}

/**
 * A circular buffer that only allows unique elements based on a key generator function.
 * When adding an element, if its generated key already exists in the buffer, the element
 * is not added and the add operation returns false. When the buffer is full and a new
 * unique element is added, the oldest element is removed to make space.
 */
export class UniqueCircularBuffer<T> extends CircularBuffer<T> {
	private uniqueKeys: Set<string> = new Set();

	constructor(
		capacity: number,
		private uniquenessKeyGenerator: (value: T) => string
	) {
		super(capacity);
	}

	/**
	 * Try add an element to the buffer. Returns true if the element was added, false if it was already in the buffer.
	 * @param value
	 * @returns
	 */
	// @ts-expect-error :: we're reimplementing add from CircularBuffer but with a different interface. This is fine.
	add(value: T): boolean {
		const key = this.uniquenessKeyGenerator(value);

		if (this.uniqueKeys.has(key)) {
			return false;
		}

		const newNode = new Node(value);

		if (this.size === 0) {
			this.tail = newNode;
			this.head = this.tail;
			newNode.next = newNode;
		} else {
			newNode.next = this.head;
			this.tail!.next = newNode;
			this.tail = newNode;
		}

		this.size++;
		this.uniqueKeys.add(key);

		if (this.size > this.capacity) {
			const nodeToRemove = this.head;
			this.head = this.head!.next;
			this.tail!.next = this.head;
			this.size--;

			const removedKey = this.uniquenessKeyGenerator(nodeToRemove!.value);
			this.uniqueKeys.delete(removedKey);
		}

		return true;
	}
}
