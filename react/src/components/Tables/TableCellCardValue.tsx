import { useMemo, ReactNode, type JSX } from 'react';
import { twMerge } from 'tailwind-merge';

export const TableCellCardValue = ({
	value,
	label,
	icon,
	size,
	highlight,
	isMobileTopRow,
	className,
	onClick,
}: {
	value: ReactNode;
	label: string;
	icon?: JSX.Element;
	size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
	highlight?: boolean;
	isMobileTopRow?: boolean;
	className?: string;
	onClick?: () => void;
}) => {
	const memoedClassName = useMemo(
		() =>
			twMerge(
				`flex flex-col items-start`,
				isMobileTopRow ? 'pt-0' : 'pt-2',
				highlight && 'text-lg',
				className
			),
		[isMobileTopRow, highlight, className]
	);

	return (
		<div
			className={memoedClassName}
			onClick={() => {
				onClick?.();
			}}
		>
			<div className="flex space-x-2 text-xs text-text-label">
				{label}
				{icon}
			</div>
			<div className={size ? `text-${size}` : ''}>{value}</div>
		</div>
	);
};
