using Fin.Domain.Finance.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Fin.Infrastructure.Finance.Contexts.Configurations
{
    public sealed class TranslationConfiguration : IEntityTypeConfiguration<Translation>
    {
        public void Configure(EntityTypeBuilder<Translation> builder)
        {
            builder.ToTable("translations");

            builder.HasKey(x => x.SourceHash);
            builder.Property(x => x.SourceHash).HasColumnName("source_hash").HasColumnType("char(64)");
            builder.Property(x => x.Source).HasColumnName("source").HasMaxLength(Translation.SourceMaxLength).IsRequired();
            builder.Property(x => x.De).HasColumnName("de").HasMaxLength(Translation.TextMaxLength);
            builder.Property(x => x.Ignored).HasColumnName("ignored");
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
        }
    }
}
