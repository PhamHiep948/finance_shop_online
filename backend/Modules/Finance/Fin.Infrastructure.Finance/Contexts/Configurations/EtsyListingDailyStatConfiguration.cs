using Fin.Domain.Finance.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Fin.Infrastructure.Finance.Contexts.Configurations
{
    public sealed class EtsyListingDailyStatConfiguration : IEntityTypeConfiguration<EtsyListingDailyStat>
    {
        public void Configure(EntityTypeBuilder<EtsyListingDailyStat> builder)
        {
            builder.ToTable("etsy_listing_daily");

            builder.HasKey(x => new { x.ListingId, x.Date });
            builder.Property(x => x.ListingId).HasColumnName("listing_id").ValueGeneratedNever();
            builder.Property(x => x.Date).HasColumnName("date").HasColumnType("date");
            builder.Property(x => x.Views).HasColumnName("views");
            builder.Property(x => x.Favorites).HasColumnName("favorites");
            builder.Property(x => x.UpdatedAt)
                .HasColumnName("updated_at")
                .HasColumnType("datetime")
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .ValueGeneratedOnAddOrUpdate();

            builder.HasIndex(x => x.Date).HasDatabaseName("idx_etsy_listing_daily_date");
        }
    }
}
