import type { Component } from 'solid-js';
import { splitProps } from 'solid-js';
import { Switch as SwitchPrimitive } from '@kobalte/core/switch';
import { cn } from '~/lib/utils';

export interface SwitchProps {
  class?: string;
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
}

const Switch: Component<SwitchProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'label']);

  return (
    <SwitchPrimitive class={cn('inline-flex items-center gap-2', local.class)} {...others}>
      <SwitchPrimitive.Input class="peer" />
      <SwitchPrimitive.Control
        class={cn(
          'inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[checked]:bg-primary',
        )}
      >
        <SwitchPrimitive.Thumb
          class={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
            'data-[checked]:translate-x-5 data-[unchecked]:translate-x-0',
          )}
        />
      </SwitchPrimitive.Control>
      {local.label && (
        <SwitchPrimitive.Label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {local.label}
        </SwitchPrimitive.Label>
      )}
    </SwitchPrimitive>
  );
};

export { Switch };
