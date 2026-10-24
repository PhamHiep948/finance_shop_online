using Fin.Domain.Finance.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Fin.Infrastructure.Finance.Contexts.Configurations
{
    public sealed class FxDailyRateConfiguration : IEntityTypeConfiguration<FxDailyRate>
    {
        public void Configure(EntityTypeBuilder<FxDailyRate> builder)
        {
            builder.ToTable("fx_daily");

            builder.HasKey(x => x.Date);
            builder.Property(x => x.Date).HasColumnName("date").HasColumnType("date");
            builder.Property(x => x.EurToUsd).HasColumnName("eur_to_usd").HasPrecision(12, 6);
            builder.Property(x => x.UpdatedAt)
                .HasColumnName("updated_at")
                .HasColumnType("datetime")
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .ValueGeneratedOnAddOrUpdate();
        }
    }
}
