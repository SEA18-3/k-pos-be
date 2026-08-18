import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyMerchant(id_merchant: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id_merchant },
      select: {
        id_merchant: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        is_active: true,
        onboarded_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return { merchant };
  }

  async getDashboardStats(id_merchant: string, from?: string, to?: string) {
    const now = new Date();

    // Default: last 30 days; max 90 days
    const toDate = to ? new Date(to) : now;
    const fromDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Clamp to max 90 days
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    const effectiveFrom = diffDays > 90
      ? new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000)
      : fromDate;

    // 1. Fetch confirmed transactions in range with payment + details
    const transactions = await this.prisma.transaction.findMany({
      where: {
        id_merchant,
        status: 'CONFIRMED',
        confirmed_at: { gte: effectiveFrom, lte: toDate },
      },
      include: {
        payment: {
          include: {
            reconciliations: { select: { status: true } },
          },
        },
        details: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
    });

    // 2. Compute gross_sales (VERIFIED payments only)
    let grossSales = 0;
    let netSales = 0;
    const dailyMap: Record<string, { gross: number; count: number }> = {};

    for (const tx of transactions) {
      if (!tx.payment || tx.payment.status !== 'VERIFIED') continue;
      const amount = Number(tx.payment.amount);
      grossSales += amount;

      // Exclude from net_sales if reconciled as INVALID (transaction is VOIDED)
      const hasInvalidRecon = tx.payment.reconciliations.some(r => r.status === 'RESOLVED_INVALID');
      if (!hasInvalidRecon) {
        netSales += amount;
      }

      // Daily series (keyed by YYYY-MM-DD)
      const dateKey = (tx.confirmed_at ?? tx.created_at).toISOString().split('T')[0];
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { gross: 0, count: 0 };
      dailyMap[dateKey].gross += amount;
      dailyMap[dateKey].count += 1;
    }

    const transactionCount = transactions.filter(tx => tx.payment?.status === 'VERIFIED').length;
    const aov = transactionCount > 0 ? Math.round(grossSales / transactionCount) : 0;

    const dailySeries = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => ({ date, gross: val.gross, count: val.count }));

    // 3. Top products (by revenue, limit 10)
    const productMap: Record<string, { name: string; quantity_sold: number; revenue: number }> = {};
    for (const tx of transactions) {
      if (!tx.payment || tx.payment.status !== 'VERIFIED') continue;
      for (const detail of tx.details) {
        const pid = detail.id_product;
        if (!productMap[pid]) {
          productMap[pid] = {
            name: detail.product_name,
            quantity_sold: 0,
            revenue: 0,
          };
        }
        productMap[pid].quantity_sold += detail.quantity;
        productMap[pid].revenue += Number(detail.subtotal);
      }
    }

    const topProducts = Object.entries(productMap)
      .map(([id_product, val]) => ({ id_product, ...val }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      period: {
        from: effectiveFrom.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
      },
      gross_sales: grossSales,
      net_sales: netSales,
      transaction_count: transactionCount,
      aov,
      daily_series: dailySeries,
      top_products: topProducts,
      data_as_of: now.toISOString(),
    };
  }
}
