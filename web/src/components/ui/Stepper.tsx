// React Bits "Stepper" (https://reactbits.dev/components/stepper, registry @react-bits/Stepper-TS-TW), MIT + Commons Clause,
// installed 2026-10-03. Patched for OralCompass (component plan §2 N6): controlled `step` prop (the real API stage gates `Continue`),
// indicators are real <button aria-current="step"> with 44 px targets, the demo aspect-ratio wrapper / `rounded-4xl shadow-xl` /
// `#5227FF #222 #a3a3a3 #120F17 bg-green-500` are gone (sand inactive · gold active · forest complete, connector fills gold),
// slide distance ±24 px at 0.3 s. Button labels have no shipped defaults: the wrapper passes copy. Reduced motion: MotionConfig drops
// the x slide and height spring; the final layout is identical.
// Delight pass (2026-10-04, rb-01): AnimatePresence mode="wait" (the old mode="sync" overlapped the leaving and entering panes),
// the entering pane slides 12 px from the side it comes from over 200 ms, the leaving pane only fades (140 ms); direction follows the
// controlled step; optional `stepName` prints each stage name under its indicator (a "Step n of m · name" line on phones); optional
// `allComplete` turns every indicator forest after publish.
import React, { useState, Children, useRef, useLayoutEffect, type HTMLAttributes, type ReactNode } from 'react';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { cn } from '@/lib/utils';

interface StepperProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  initialStep?: number;
  /** Controlled current step (1-based). When set, the stepper never advances on its own; `onStepChange` asks the owner to move. */
  step?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  /** Accessible names for the indicator buttons, e.g. (n) => `Step ${n}: Upload` */
  stepLabel?: (step: number) => string;
  disableStepIndicators?: boolean;
  /** Visible stage names under the indicators (and a "Step n of m · name" line on narrow screens). */
  stepName?: (step: number) => string;
  /** Every stage finished (e.g. published): all indicators show the forest check. */
  allComplete?: boolean;
  renderStepIndicator?: (props: {
    step: number;
    currentStep: number;
    onStepClick: (clicked: number) => void;
  }) => ReactNode;
}

export default function Stepper({
  children,
  initialStep = 1,
  step,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = '',
  nextButtonText = '',
  completeButtonText = '',
  stepLabel = (n) => `Step ${n}`,
  disableStepIndicators = false,
  stepName,
  allComplete = false,
  renderStepIndicator,
  className,
  ...rest
}: StepperProps) {
  const [innerStep, setInnerStep] = useState<number>(initialStep);
  const currentStep = step ?? innerStep;
  const [direction, setDirection] = useState<number>(1);
  // a controlled step moves without handleNext/handleBack: derive the direction from the previous step
  const prevStep = useRef(currentStep);
  if (prevStep.current !== currentStep) { const d = currentStep > prevStep.current ? 1 : -1; prevStep.current = currentStep; if (d !== direction) setDirection(d); }
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = (newStep: number) => {
    if (step === undefined) setInnerStep(newStep);
    if (newStep > totalSteps) {
      onFinalStepCompleted();
    } else {
      onStepChange(newStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1);
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = () => {
    setDirection(1);
    updateStep(totalSteps + 1);
  };

  return (
    <div className={cn('flex min-h-full flex-1 flex-col', className)} {...rest}>
      <div className={cn('mx-auto w-full max-w-xl rounded-xl border border-rule bg-paper-deep', stepCircleContainerClassName)}>
        <ol className={cn(stepContainerClassName, 'flex w-full list-none items-center p-4 sm:p-6')}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;
            return (
              <React.Fragment key={stepNumber}>
                <li className="contents">
                  {renderStepIndicator ? (
                    renderStepIndicator({
                      step: stepNumber,
                      currentStep,
                      onStepClick: clicked => {
                        setDirection(clicked > currentStep ? 1 : -1);
                        updateStep(clicked);
                      }
                    })
                  ) : (
                    <StepIndicator
                      step={stepNumber}
                      label={stepLabel(stepNumber)}
                      name={stepName?.(stepNumber)}
                      disableStepIndicators={disableStepIndicators}
                      currentStep={allComplete ? totalSteps + 1 : currentStep}
                      onClickStep={clicked => {
                        setDirection(clicked > currentStep ? 1 : -1);
                        updateStep(clicked);
                      }}
                    />
                  )}
                </li>
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            );
          })}
        </ol>

        {stepName && currentStep <= totalSteps && (
          <p className="up-step-now sm:hidden" aria-hidden="true">Step {currentStep} of {totalSteps} · {stepName(currentStep)}</p>
        )}

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={cn('space-y-2 px-4 sm:px-6', contentClassName)}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (backButtonText || nextButtonText || completeButtonText) && (
          <div className={cn('px-4 pb-4 sm:px-6 sm:pb-6', footerClassName)}>
            <div className={cn('mt-6 flex', currentStep !== 1 ? 'justify-between' : 'justify-end')}>
              {currentStep !== 1 && backButtonText && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="unstyled min-h-11 rounded-lg px-4 text-ink-soft transition-colors hover:text-ink motion-reduce:transition-none"
                  {...backButtonProps}
                >
                  {backButtonText}
                </button>
              )}
              {(isLastStep ? completeButtonText : nextButtonText) && (
                <button
                  type="button"
                  onClick={isLastStep ? handleComplete : handleNext}
                  className="unstyled flex min-h-11 items-center justify-center rounded-full bg-ink px-5 font-medium text-paper transition-colors hover:bg-ink/85 disabled:opacity-55 motion-reduce:transition-none"
                  {...nextButtonProps}
                >
                  {isLastStep ? completeButtonText : nextButtonText}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StepContentWrapperProps {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: ReactNode;
  className?: string;
}

function StepContentWrapper({ isCompleted, currentStep, direction, children, className = '' }: StepContentWrapperProps) {
  const [parentHeight, setParentHeight] = useState<number>(0);

  return (
    <motion.div
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height: isCompleted ? 0 : parentHeight }}
      transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
      className={className}
    >
      <AnimatePresence initial={false} mode="wait" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={h => setParentHeight(h)}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SlideTransitionProps {
  children: ReactNode;
  direction: number;
  onHeightReady: (height: number) => void;
}

function SlideTransition({ children, direction, onHeightReady }: SlideTransitionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (containerRef.current) {
      onHeightReady(containerRef.current.offsetHeight);
    }
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}

const stepVariants: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 12 : -12, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.2, ease: [0.2, 0.7, 0.2, 1] } },
  exit: { opacity: 0, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }
};

interface StepProps {
  children: ReactNode;
}

export function Step({ children }: StepProps) {
  return <div className="px-0 py-2">{children}</div>;
}

interface StepIndicatorProps {
  step: number;
  label: string;
  name?: string;
  currentStep: number;
  onClickStep: (clicked: number) => void;
  disableStepIndicators?: boolean;
}

function StepIndicator({ step, label, name, currentStep, onClickStep, disableStepIndicators = false }: StepIndicatorProps) {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';

  const handleClick = () => {
    if (step !== currentStep && !disableStepIndicators) {
      onClickStep(step);
    }
  };

  const button = (
    <motion.button
      type="button"
      onClick={handleClick}
      aria-current={status === 'active' ? 'step' : undefined}
      aria-label={label}
      disabled={disableStepIndicators || step > currentStep}
      className="unstyled relative inline-grid min-h-11 min-w-11 place-items-center border-0 bg-transparent p-0 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
      animate={status}
      initial={false}
    >
      <motion.span
        variants={{
          inactive: { scale: 1, backgroundColor: 'var(--sand)', color: 'var(--ink)' },
          active: { scale: 1, backgroundColor: 'var(--gold)', color: 'var(--ink)' },
          complete: { scale: 1, backgroundColor: 'var(--forest)', color: 'var(--paper)' }
        }}
        transition={{ duration: 0.3 }}
        className="flex h-8 w-8 items-center justify-center rounded-full font-semibold tabular-nums"
      >
        {status === 'complete' ? (
          <CheckIcon className="h-4 w-4" aria-hidden="true" />
        ) : status === 'active' ? (
          <span className="h-3 w-3 rounded-full bg-ink" aria-hidden="true" />
        ) : (
          <span className="text-sm" aria-hidden="true">{step}</span>
        )}
      </motion.span>
    </motion.button>
  );
  if (!name) return button;
  return (
    <span className="up-step-ind" data-status={status}>
      {button}
      <span className="up-step-name hidden sm:block" aria-hidden="true">{name}</span>
    </span>
  );
}

interface StepConnectorProps {
  isComplete: boolean;
}

function StepConnector({ isComplete }: StepConnectorProps) {
  const lineVariants: Variants = {
    incomplete: { width: 0, backgroundColor: 'transparent' },
    complete: { width: '100%', backgroundColor: 'var(--gold)' }
  };

  return (
    <li aria-hidden="true" className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded bg-ink/15">
      <motion.div
        className="absolute left-0 top-0 h-full"
        variants={lineVariants}
        initial={false}
        animate={isComplete ? 'complete' : 'incomplete'}
        transition={{ duration: 0.4 }}
      />
    </li>
  );
}

interface CheckIconProps extends React.SVGProps<SVGSVGElement> {}

function CheckIcon(props: CheckIconProps) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.1, type: 'tween', ease: 'easeOut', duration: 0.3 }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
