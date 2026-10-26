import { splitPhoneNumbers } from '@/lib/domain/phone';

/** Keep contact columns compact; complete numbers remain in guest details. */
export function PhoneNumbers({ value }: { value: string | null }) {
  const numbers = splitPhoneNumbers(value);
  return <div className="admin-phone-list">
    {numbers.length ? numbers.slice(0, 2).map(number => <a key={number} href={'tel:' + number}>{number}</a>) : <span className="text-muted-foreground">—</span>}
    {numbers.length > 2 && <span className="text-xs text-muted-foreground" title={numbers.slice(2).join(', ')}>+{numbers.length - 2} more in details</span>}
  </div>;
}
