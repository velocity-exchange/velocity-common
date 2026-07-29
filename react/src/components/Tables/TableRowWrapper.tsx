import { twMerge } from 'tailwind-merge';

export const TableRowWrapper = ({
	grid,
	noBorder,
	topBorder,
	lastChildNoBorder,
	lastColumnJustify,
	strongBottomBorder,
	className,
	children,
}: {
	grid: string;
	noBorder?: boolean;
	topBorder?: boolean;
	lastChildNoBorder?: boolean;
	lastColumnJustify?: string;
	strongBottomBorder?: boolean;
	className?: string;
	children: React.ReactNode;
}) => {
	const borderClass = noBorder
		? ''
		: strongBottomBorder
			? 'border-b-3 border-container-border'
			: 'border-b border-container-border';

	const topBorderClass = topBorder ? 'border-t border-container-border' : '';
	const lastChildClass = lastChildNoBorder ? 'last:border-b-0' : '';

	return (
		<div
			className={twMerge(
				'grid auto-rows-auto grid-flow-row [&>*]:text-left [&>*]:items-left [&>*]:justify-self-start',
				'[&>*]:text-left [&>*]:items-left [&>*]:justify-self-start first-of-type:[&>]:pl-4',
				`[&>*]:last:pr-4 [&>*]:last:text-left [&>*]:last:items-left ${
					lastColumnJustify
						? `[&>*]:last:justify-self-${lastColumnJustify}`
						: '[&>*]:last:justify-self-end'
				}`,
				borderClass,
				topBorderClass,
				lastChildClass,
				className
			)}
			style={{ gridTemplateColumns: grid }}
		>
			{children}
		</div>
	);
};
