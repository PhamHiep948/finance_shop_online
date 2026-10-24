using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fin.Infrastructure.Finance.Migrations
{
    /// <inheritdoc />
    public partial class IncomeCategoryOptional : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<ulong>(
                name: "category_id",
                table: "ledger_entries",
                type: "bigint unsigned",
                nullable: true,
                oldClrType: typeof(ulong),
                oldType: "bigint unsigned");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Incomes still without a product group go back to the first income category, as the NOT NULL foreign key requires.
            migrationBuilder.Sql(
                "UPDATE ledger_entries SET category_id = (SELECT MIN(id) FROM categories WHERE kind = 'INCOME') " +
                "WHERE category_id IS NULL");

            migrationBuilder.AlterColumn<ulong>(
                name: "category_id",
                table: "ledger_entries",
                type: "bigint unsigned",
                nullable: false,
                defaultValue: 0ul,
                oldClrType: typeof(ulong),
                oldType: "bigint unsigned",
                oldNullable: true);
        }
    }
}
