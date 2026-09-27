import type { BusinessSettings, ReceiptData } from '../lib/types';
import { dateTime, methodName, rupiah } from '../lib/format';

/** Tampilan struk (lebar ±58/80 mm) yang dapat dicetak lewat dialog cetak browser. */
export default function Receipt({ data, settings }: { data: ReceiptData; settings: BusinessSettings | null }) {
  const name = settings?.business_name ?? 'Jebewsizou';
  return (
    <div className="receipt">
      <div className="r-center">
        {settings?.logo_url && <img src={settings.logo_url} alt="" style={{ maxWidth: 70, maxHeight: 70, marginBottom: 4 }} />}
        <strong>{name}</strong>
        <div>{data.outlet.name}</div>
        {data.outlet.address && <div>{data.outlet.address}</div>}
        {data.outlet.phone && <div>Telp {data.outlet.phone}</div>}
        {settings?.receipt_header && <div>{settings.receipt_header}</div>}
      </div>
      <hr />
      <div className="r-row">
        <span>No</span>
        <span>{data.order_number}</span>
      </div>
      <div className="r-row">
        <span>Waktu</span>
        <span>{dateTime(data.created_at)}</span>
      </div>
      <div className="r-row">
        <span>Kasir</span>
        <span>{data.cashier_name}</span>
      </div>
      {data.status !== 'completed' && (
        <div className="r-center">
          <strong>*** {data.status === 'void' ? 'DIBATALKAN' : 'REFUND'} ***</strong>
        </div>
      )}
      <hr />
      {data.items.map((it, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div>
            {it.product_name}
            {it.variant_name ? ` (${it.variant_name})` : ''}
          </div>
          {it.modifiers.map((m, j) => (
            <div key={j} className="r-sub">
              + {m.name}
              {Number(m.price_delta) > 0 ? ` (${rupiah(m.price_delta)})` : ''}
            </div>
          ))}
          {it.note && <div className="r-sub">Catatan: {it.note}</div>}
          <div className="r-row">
            <span>
              {it.quantity} x {rupiah(it.unit_price)}
            </span>
            <span>{rupiah(it.line_total)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="r-row">
        <span>Subtotal</span>
        <span>{rupiah(data.subtotal)}</span>
      </div>
      {Number(data.discount_total) > 0 && (
        <div className="r-row">
          <span>Diskon{data.discount_name ? ` (${data.discount_name})` : ''}</span>
          <span>-{rupiah(data.discount_total)}</span>
        </div>
      )}
      {Number(data.tax_total) > 0 && (
        <div className="r-row">
          <span>
            {data.tax_name ?? 'Pajak'} {Number(data.tax_rate)}%
          </span>
          <span>{rupiah(data.tax_total)}</span>
        </div>
      )}
      <div className="r-row" style={{ fontWeight: 700, fontSize: 15 }}>
        <span>TOTAL</span>
        <span>{rupiah(data.total)}</span>
      </div>
      {data.payment && (
        <>
          <div className="r-row">
            <span>Bayar ({methodName(data.payment.method)})</span>
            <span>{rupiah(data.payment.received)}</span>
          </div>
          {data.payment.method === 'cash' && (
            <div className="r-row">
              <span>Kembali</span>
              <span>{rupiah(data.payment.change)}</span>
            </div>
          )}
        </>
      )}
      <hr />
      <div className="r-center">{settings?.receipt_footer ?? 'Terima kasih'}</div>
    </div>
  );
}

export function receiptText(data: ReceiptData, settings: BusinessSettings | null) {
  const w = 32;
  const line = (l: string, r = '') => l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r;
  const out: string[] = [];
  out.push((settings?.business_name ?? 'Jebewsizou').toUpperCase(), data.outlet.name);
  if (data.outlet.address) out.push(data.outlet.address);
  out.push('-'.repeat(w), line('No', data.order_number), line('Waktu', dateTime(data.created_at)), line('Kasir', data.cashier_name));
  if (data.status !== 'completed') out.push(`*** ${data.status === 'void' ? 'DIBATALKAN' : 'REFUND'} ***`);
  out.push('-'.repeat(w));
  for (const it of data.items) {
    out.push(`${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ''}`);
    for (const m of it.modifiers) out.push(`  + ${m.name}`);
    if (it.note) out.push(`  Catatan: ${it.note}`);
    out.push(line(`  ${it.quantity} x ${rupiah(it.unit_price)}`, rupiah(it.line_total)));
  }
  out.push('-'.repeat(w), line('Subtotal', rupiah(data.subtotal)));
  if (Number(data.discount_total) > 0) out.push(line('Diskon', `-${rupiah(data.discount_total)}`));
  if (Number(data.tax_total) > 0) out.push(line(`${data.tax_name ?? 'Pajak'} ${Number(data.tax_rate)}%`, rupiah(data.tax_total)));
  out.push(line('TOTAL', rupiah(data.total)));
  if (data.payment) {
    out.push(line(`Bayar (${methodName(data.payment.method)})`, rupiah(data.payment.received)));
    if (data.payment.method === 'cash') out.push(line('Kembali', rupiah(data.payment.change)));
  }
  out.push('-'.repeat(w), settings?.receipt_footer ?? 'Terima kasih');
  return out.join('\r\n');
}
