import type { Component, ComponentProps, JSX, ParentComponent } from 'solid-js';
import { mergeProps, splitProps } from 'solid-js';
import { Tooltip as TooltipPrimitive } from '@kobalte/core/tooltip';
import { cn } from '~/lib/utils';

const TooltipTrigger = TooltipPrimitive.Trigger;

const Tooltip: ParentComponent<ComponentProps<typeof TooltipPrimitive>> = (props) => {
  const merged = mergeProps({ gutter: 4 }, props);
  return <TooltipPrimitive {...merged} />;
};

export interface TooltipContentProps extends ComponentProps<typeof TooltipPrimitive.Content> {}

const TooltipContent: Component<TooltipContentProps> = (props) => {
  const [local, others] = splitProps(props, ['class']);

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn(
          'z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md',
          'animate-in fade-in-0 zoom-in-95',
          'data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95',
          'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
          local.class,
        )}
        {...others}
      />
    </TooltipPrimitive.Portal>
  );
};

export { Tooltip, TooltipTrigger, TooltipContent };
