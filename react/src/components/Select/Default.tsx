import {
	PropsWithChildren,
	ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import { ChevronDown, ChevronUp } from '@velocity-exchange/icons';
import { Placement } from '@floating-ui/react';
import { twMerge } from 'tailwind-merge';
import { GradientText, Typo } from '../Text';
import PopoverWrapper from './PopoverWrapper';
import { useTargetedPopover } from '../../hooks/useTargetedPopover';

type SelectProps = {
	id: string;
	className?: string;
	labelClassName?: string;
	innerContainerClassName?: string;
	optionsClassName?: string;
	selection: string | any[] | any;
	options: {
		value: any;
		label: string;
		icon?: ReactNode;
		description?: string;
		customTextClass?: string;
		selectedTextClass?: string;
		className?: string;
		selectedIcon?: ReactNode;
		onClick?: () => void;
	}[];
	onChange: (value: string | any) => void;
	style?: React.CSSProperties;
	defaultLabel?: string; // Displays this string if value '' is selected
	noStyle?: boolean;
	small?: boolean;
	maxHeight?: number;
	center?: boolean;
	useRoundedGradient?: boolean;
	useFullWidth?: boolean;
	customRounding?: string;
	disabled?: boolean;
	customWidth?: string;
	preventPopupIfOneOptionOnly?: boolean;
	customPopupWidthClass?: string;
	useTargetWidth?: boolean;
	customHeight?: string;
	placement?: Placement;
	title?: string;
	dropdownIsSelected?: boolean;
};

export const DefaultSelect = ({
	id,
	selection,
	options,
	onChange,
	defaultLabel,
	maxHeight,
	useFullWidth,
	customRounding,
	disabled,
	optionsClassName,
	preventPopupIfOneOptionOnly,
	className,
	labelClassName,
	innerContainerClassName,
	useTargetWidth,
	placement,
	customHeight,
}: SelectProps) => {
	const {
		refs,
		floatingStyles,
		getFloatingProps,
		setIsPopoverOpen,
		isPopoverOpen,
	} = useTargetedPopover(
		{
			strategy: 'fixed',
			placement: placement ?? 'bottom-start',
		},
		{
			offset: 5,
			disableAutoPlacement: true,
		}
	);

	const { selectedOption, setPopupRef, setWrapperRef } = useSelectState({
		selection,
		options,
		usingPopupWrapper: true,
		preventPopupIfOneOptionOnly,
		setShowPopup: setIsPopoverOpen,
		showPopup: isPopoverOpen,
	});

	return (
		<SelectWrapper
			setWrapperRef={setWrapperRef}
			useFullWidth={useFullWidth}
			disabled={disabled}
			customHeight={customHeight}
		>
			<div
				id={id}
				ref={refs.setReference}
				onClick={() => {
					setIsPopoverOpen(!isPopoverOpen);
				}}
				className={twMerge(
					`p-[1px] bg-input-bg border-tooltip-bg text-text-input hover:bg-input-bg-hover border flex items-center hover:cursor-pointer rounded-sm text-sm select-none`,
					useFullWidth && 'w-full',
					customHeight ? customHeight.replace('max-', '') : 'h-8',
					customRounding,
					className,
					isPopoverOpen && 'bg-brand-gradient-border'
				)}
			>
				<div
					className={twMerge(
						'flex items-center justify-between w-full bg-input-bg h-full px-2',
						innerContainerClassName
					)}
				>
					<div
						className={twMerge(
							'inline-flex items-center truncate overflow-ellipsis',
							disabled && 'text-text-secondary',
							labelClassName,
							selectedOption?.selectedTextClass
						)}
					>
						<Typo.T4>
							{!selectedOption?.value && defaultLabel
								? defaultLabel
								: selectedOption?.label}
							{selectedOption?.icon}
						</Typo.T4>
					</div>

					{!(preventPopupIfOneOptionOnly && options.length === 1) &&
					isPopoverOpen ? (
						<ChevronUp className="w-3 h-3 ml-1 text-darkBlue-30" />
					) : (
						<ChevronDown className="w-3 h-3 ml-1 text-darkBlue-30" />
					)}
				</div>
			</div>

			{isPopoverOpen && (
				<PopoverWrapper
					portalId={id}
					ref={refs.setFloating}
					{...getFloatingProps()}
					style={floatingStyles}
					className={'z-[150]'}
					useTargetWidth={useTargetWidth}
				>
					<div
						className="w-full overflow-auto border bg-main-bg -bottom-2 thin-scroll border-container-border text-text-input"
						style={maxHeight ? { maxHeight: `${maxHeight}px` } : {}}
						ref={setPopupRef}
					>
						{options.map((option) => {
							return (
								<div
									key={option.label}
									className={`border-b divide-y select-none border-container-border last:border-b-0 hover:cursor-pointer`}
									onClick={() => {
										onChange(option.value);
										setIsPopoverOpen(false);
									}}
								>
									<GradientText onHover>
										<div
											className={twMerge(
												'flex items-center px-2 py-1 pt-2 text-text-input font-normal text-[14px]',
												disabled && 'text-text-secondary',
												option.customTextClass,
												optionsClassName
											)}
										>
											{option.label}
											{option.icon}
										</div>
									</GradientText>
								</div>
							);
						})}
					</div>
				</PopoverWrapper>
			)}
		</SelectWrapper>
	);
};

type SelectStateResult = ReturnType<typeof useSelectState>;

const SelectWrapper = (
	props: PropsWithChildren<
		Pick<SelectStateResult, 'setWrapperRef'> &
			Pick<
				SelectProps,
				'useFullWidth' | 'disabled' | 'customWidth' | 'customHeight'
			>
	>
) => {
	return (
		<div
			className={twMerge(
				'relative',
				props.useFullWidth && 'w-full',
				props.customWidth,
				props.customHeight,
				props.disabled && `hover:cursor-not-allowed pointer-events-none`
			)}
			ref={props.setWrapperRef}
		>
			{props.children}
		</div>
	);
};

const useSelectState = (
	props: Pick<
		SelectProps,
		'selection' | 'options' | 'preventPopupIfOneOptionOnly'
	> & {
		usingPopupWrapper?: boolean;
		showPopup: boolean;
		setShowPopup: (showPopup: boolean) => void;
	}
) => {
	const [selectedOption, setSelectedOption] = useState<
		SelectProps['options'][0] | undefined
	>(
		props.options.find((option) => option.value === props.selection) ??
			props.options[0]
	);

	useEffect(() => {
		setSelectedOption(
			props.options.find((option) => option.value === props.selection)
		);
	}, [props.selection, props.options]);

	const toggleShowPopup = () => {
		if (props.preventPopupIfOneOptionOnly && props.options.length === 1) return;

		props.setShowPopup(!props.showPopup);
	};

	const popupRef = useRef<HTMLDivElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const setPopupRef = useCallback((node: HTMLDivElement | null) => {
		popupRef.current = node;
	}, []);
	const setWrapperRef = useCallback((node: HTMLDivElement | null) => {
		wrapperRef.current = node;
	}, []);

	const handleClick = (clickEvent: PointerEvent) => {
		if (props.usingPopupWrapper) return;
		if (!props.showPopup) return;

		const newFocus = clickEvent.target as Element;

		// if (!popupRef.current) return;

		// check if the blur occured from a click inside of wrapper
		if (
			wrapperRef.current?.contains(newFocus) ||
			wrapperRef.current === newFocus
		) {
			return;
		}

		props.setShowPopup(false);
	};

	useEffect(() => {
		// Must be a stable reference so removeEventListener actually detaches it.
		const onMouseDown = (e: MouseEvent) => handleClick(e as PointerEvent);

		window.addEventListener('mousedown', onMouseDown);

		return () => window.removeEventListener('mousedown', onMouseDown);
	}, [props.showPopup]);

	return {
		selectedOption,
		setPopupRef,
		setWrapperRef,
		toggleShowPopup,
		popupRef,
		wrapperRef,
	};
};
