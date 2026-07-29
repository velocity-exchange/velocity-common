import { PropsWithChildren } from 'react';
import { twMerge } from 'tailwind-merge';
import { Typo } from '../Text';

export const BodyCellWrapper = ({
	children,
	className,
	label,
	onClick,
	dataPuppetTag,
	flexCol,
	alignCenter,
	alignRight,
	innerClassName,
}: PropsWithChildren<{
	className?: string;
	innerClassName?: string;
	label?: string;
	onClick?: () => void;
	dataPuppetTag?: string;
	flexCol?: boolean;
	alignCenter?: boolean;
	alignRight?: boolean;
}>) => {
	return (
		<div
			className={twMerge(
				`w-full flex flex-row px-1 items-center h-full`,
				alignRight && 'justify-end',
				onClick && 'hover:cursor-pointer',
				className
			)}
			onClick={onClick}
			data-puppet-tag={dataPuppetTag}
		>
			{label && <div className="text-xs text-text-label">{label}</div>}
			<Typo.B2
				className={twMerge(
					`flex w-full`,
					alignCenter
						? 'items-center'
						: alignRight
							? 'items-end'
							: 'items-start',
					flexCol ? 'flex-col' : 'flex-row',
					innerClassName
				)}
			>
				{children}
			</Typo.B2>
		</div>
	);
};
