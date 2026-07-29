export const chunks = <T>(array: readonly T[], size: number): T[][] => {
	return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
		array.slice(index * size, index * size + size)
	);
};

export const glueArray = <T>(size: number, elements: T[]): T[][] => {
	const gluedElements: T[][] = [];

	elements.forEach((element, index) => {
		const gluedIndex = Math.floor(index / size);
		if (gluedElements[gluedIndex]) {
			gluedElements[gluedIndex].push(element);
		} else {
			gluedElements[gluedIndex] = [element];
		}
	});

	return gluedElements;
};
