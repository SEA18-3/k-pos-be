import { BadRequestException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: JwtPayload, from?: string, to?: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id_merchant: user.id_merchant },
      select: { timezone: true },
    });
    const range = normalizeRange(from, to, merchant.timezone);
    const [daily, products, oldestPending] = await Promise.all([
      this.prisma.merchantDailySales.findMany({
        where: { id_merchant: user.id_merchant, sales_date: { gte: range.from, lte: range.to } },
        orderBy: { sales_date: 'asc' },
      }),
      this.prisma.merchantProductDailySales.findMany({
        where: { id_merchant: user.id_merchant, sales_date: { gte: range.from, lte: range.to } },
      }),
      this.prisma.backendOutbox.findFirst({
        where: {
          id_merchant: user.id_merchant,
          event_type: { startsWith: 'REPORTING_' },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        orderBy: { created_at: 'asc' },
        select: { created_at: true },
      }),
    ]);
    const grossSales = daily.reduce((sum, day) => sum + day.gross_sales, 0);
    const netSales = daily.reduce((sum, day) => sum + day.net_sales, 0);
    const transactionCount = daily.reduce((sum, day) => sum + day.transaction_count, 0);
    const top = new Map<
      string,
      {
        id_product: string;
        product_name: string;
        quantity: number;
        gross_sales: number;
        net_sales: number;
      }
    >();
    for (const row of products) {
      const value = top.get(row.id_product) ?? {
        id_product: row.id_product,
        product_name: row.product_name,
        quantity: 0,
        gross_sales: 0,
        net_sales: 0,
      };
      value.quantity += row.quantity;
      value.gross_sales += row.gross_sales;
      value.net_sales += row.net_sales;
      top.set(row.id_product, value);
    }
    const dataAsOf = daily.reduce<Date | null>(
      (latest, day) => (!latest || day.updated_at > latest ? day.updated_at : latest),
      null,
    );
    return {
      timezone: merchant.timezone,
      from: dateOnly(range.from),
      to: dateOnly(range.to),
      gross_sales: grossSales,
      net_sales: netSales,
      transaction_count: transactionCount,
      average_order_value: transactionCount > 0 ? Math.round(netSales / transactionCount) : 0,
      daily_series: daily.map((day) => ({
        date: dateOnly(day.sales_date),
        gross_sales: day.gross_sales,
        net_sales: day.net_sales,
        transaction_count: day.transaction_count,
      })),
      top_products: [...top.values()]
        .sort((left, right) => right.net_sales - left.net_sales)
        .slice(0, 10),
      data_as_of: dataAsOf?.toISOString() ?? null,
      projection_lag_seconds: oldestPending
        ? Math.max(0, Math.round((Date.now() - oldestPending.created_at.getTime()) / 1000))
        : 0,
    };
  }

  async auditEvents(user: JwtPayload, cursor?: string) {
    const items = await this.prisma.auditEvent.findMany({
      where: { id_merchant: user.id_merchant },
      take: 51,
      ...(cursor ? { cursor: { id_event: cursor }, skip: 1 } : {}),
      orderBy: [{ created_at: 'desc' }, { id_event: 'desc' }],
      include: { actor: { select: { full_name: true, role: true } } },
    });
    const hasMore = items.length > 50;
    if (hasMore) items.pop();
    return { items, meta: { next_cursor: hasMore ? (items.at(-1)?.id_event ?? null) : null } };
  }
}

export function normalizeRange(
  from?: string,
  to?: string,
  timezone = 'UTC',
  now = new Date(),
): { from: Date; to: Date } {
  const end = to ? parseDate(to) : zonedDate(now, timezone);
  const start = from ? parseDate(from) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (start > end || end.getTime() - start.getTime() > 89 * 24 * 60 * 60 * 1000) {
    throw new BadRequestException({
      code: 'INVALID_REPORT_RANGE',
      message: 'Report range must be between 1 and 90 days',
    });
  }
  return { from: start, to: end };
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException({
      code: 'INVALID_REPORT_DATE',
      message: 'Dates must use YYYY-MM-DD',
    });
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException({ code: 'INVALID_REPORT_DATE', message: 'Invalid date' });
  return date;
}

function zonedDate(value: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return parseDate(`${fields.year}-${fields.month}-${fields.day}`);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
