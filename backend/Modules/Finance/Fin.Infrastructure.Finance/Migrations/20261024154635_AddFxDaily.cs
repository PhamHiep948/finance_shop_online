using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fin.Infrastructure.Finance.Migrations
{
    /// <inheritdoc />
    public partial class AddFxDaily : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "fx_daily",
                columns: table => new
                {
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    eur_to_usd = table.Column<decimal>(type: "decimal(12,6)", precision: 12, scale: 6, nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.ComputedColumn)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fx_daily", x => x.date);
                })
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "fx_daily");
        }
    }
}
