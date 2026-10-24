using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Contexts.Converters;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Fin.Infrastructure.Finance.Contexts.Configurations
{
    public sealed class LedgerEntryConfiguration : IEntityTypeConfiguration<LedgerEntry>
    {
        public void Configure(EntityTypeBuilder<LedgerEntry> builder)
        {
            builder.ToTable("ledger_entries");

            builder.Property(x => x.Id).HasColumnName("id").HasConversion<ulong>().ValueGeneratedOnAdd();
            builder.Property(x => x.Kind).HasColumnName("kind").HasMaxLength(10).IsRequired();
            builder.Property(x => x.Date).HasColumnName("date").HasColumnType("date");
            builder.Property(x => x.Description).HasColumnName("description").HasMaxLength(500).IsRequired();
            builder.Property(x => x.CategoryId).HasColumnName("category_id").HasConversion<ulong?>();
            builder.Property(x => x.Amount).HasColumnName("amount").HasPrecision(18, 2);
            builder.Property(x => x.TaxPercent).HasColumnName("tax_percent").HasPrecision(6, 2);
            builder.Property(x => x.AmountAfterTax).HasColumnName("amount_after_tax").HasPrecision(18, 2);
            builder.Property(x => x.CurrencyCode).HasColumnName("currency_code").HasColumnType("char(3)").HasDefaultValue("USD").IsRequired();
            builder.Property(x => x.OrderCode).HasColumnName("order_code").HasMaxLength(150);
            builder.Property(x => x.SaleRegion).HasColumnName("sale_region").HasMaxLength(30);
            builder.Property(x => x.SalesChannel).HasColumnName("sales_channel").HasMaxLength(40);
            builder.Property(x => x.ProductQty).HasColumnName("product_qty");
            builder.Property(x => x.Payee).HasColumnName("payee").HasMaxLength(255);
            builder.Property(x => x.OriginScope).HasColumnName("origin_scope").HasMaxLength(30);
            builder.Property(x => x.PaymentMethod).HasColumnName("payment_method").HasMaxLength(40);
            builder.Property(x => x.Source).HasColumnName("source").HasMaxLength(20);
            builder.Property(x => x.LinkedIncomeId).HasColumnName("linked_income_id").HasConversion<ulong?>();
            builder.Property(x => x.Details)
                .HasColumnName("details")
                .HasColumnType("json")
                .HasConversion(LedgerDetailsConverter.Converter, LedgerDetailsConverter.Comparer);
            builder.Property(x => x.CreatedAt)
                .HasColumnName("created_at")
                .HasColumnType("datetime")
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .ValueGeneratedOnAdd();
            builder.Property(x => x.UpdatedAt)
                .HasColumnName("updated_at")
                .HasColumnType("datetime")
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .ValueGeneratedOnAddOrUpdate();
            builder.Property(x => x.DeletedAt).HasColumnName("deleted_at").HasColumnType("datetime");

            builder.Ignore(x => x.IsDeleted);
            builder.Ignore(x => x.IsFromEtsy);
            builder.Ignore(x => x.IsEtsyAds);

            builder.HasIndex(x => new { x.Kind, x.Date }).HasDatabaseName("idx_kind_date");
            builder.HasIndex(x => x.LinkedIncomeId).HasDatabaseName("idx_linked_income");

            builder.HasOne<Category>()
                .WithMany()
                .HasForeignKey(x => x.CategoryId)
                .HasConstraintName("fk_ledger_category")
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
