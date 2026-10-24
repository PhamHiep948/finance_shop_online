using Fin.Domain.Finance.Entities;
using Fin.Model.Dto.Finance.Requests;
using Fin.Model.Dto.Finance.Responses;
using Fin.Service.Finance.UseCases.Translations.Commands;
using Fin.Service.Finance.UseCases.Translations.Commands.Handlers;
using Fin.Service.Finance.UseCases.Translations.Queries;
using Fin.Service.Finance.UseCases.Translations.Queries.Handlers;
using Fin.Service.Finance.UseCases.Translations.Validators;
using Fin.Tests.Unit.Support;

namespace Fin.Tests.Unit.Services
{
    public sealed class TranslationsTests
    {
        private static async Task<List<TranslationResponse>> SaveAsync(InMemoryTranslationUnitOfWork unitOfWork, params TranslationRequest[] items)
        {
            var result = await new SaveTranslationsHandler(unitOfWork)
                .Handle(new SaveTranslationsCommand { Items = [.. items] }, CancellationToken.None);
            Assert.True(result.Succeeded);
            return result.Data!;
        }

        private static async Task<int> DiscoverAsync(InMemoryTranslationUnitOfWork unitOfWork, params string[] sources)
        {
            var result = await new DiscoverTranslationsHandler(unitOfWork)
                .Handle(new DiscoverTranslationsCommand { Sources = [.. sources] }, CancellationToken.None);
            Assert.True(result.Succeeded);
            return result.Data!.Added;
        }

        [Fact]
        public void Normalize_trims_and_collapses_whitespace()
        {
            Assert.Equal("Tổng cộng", Translation.Normalize("  Tổng \n  cộng "));
            Assert.Equal(string.Empty, Translation.Normalize(null));
        }

        [Fact]
        public void Hash_is_stable_and_differs_per_source()
        {
            Assert.Equal(Translation.HashOf("Khoản thu"), Translation.HashOf("Khoản thu"));
            Assert.NotEqual(Translation.HashOf("Khoản thu"), Translation.HashOf("Khoản chi"));
            Assert.Equal(64, Translation.HashOf("Khoản thu").Length);
        }

        [Fact]
        public async Task Discover_adds_only_new_sources_untranslated()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();
            unitOfWork.Seed("Khoản thu", "Einnahmen");

            var added = await DiscoverAsync(unitOfWork, "Khoản thu", " Khoản  chi ", "Khoản chi", "", "Trang {0} / {1}");

            Assert.Equal(2, added);
            Assert.Equal(["Khoản chi", "Khoản thu", "Trang {0} / {1}"], unitOfWork.Rows.Select(x => x.Source).Order(StringComparer.Ordinal).ToArray());
            Assert.Equal("Einnahmen", unitOfWork.Rows.Single(x => x.Source == "Khoản thu").De);
            Assert.Null(unitOfWork.Rows.Single(x => x.Source == "Khoản chi").De);
        }

        [Fact]
        public async Task Discover_with_nothing_new_does_not_commit()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();
            unitOfWork.Seed("Khoản thu");

            Assert.Equal(0, await DiscoverAsync(unitOfWork, "Khoản thu"));
            Assert.Equal(0, unitOfWork.Commits);
        }

        [Fact]
        public async Task Save_sets_translation_trimmed_and_blank_as_null()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();
            unitOfWork.Seed("Khoản thu");
            unitOfWork.Seed("Khoản chi", "Ausgaben");

            var saved = await SaveAsync(unitOfWork,
                new TranslationRequest { Source = "Khoản thu", De = "  Einnahmen " },
                new TranslationRequest { Source = "Khoản chi", De = "   " });

            Assert.Equal("Einnahmen", saved.Single(x => x.Source == "Khoản thu").De);
            Assert.Null(saved.Single(x => x.Source == "Khoản chi").De);
        }

        [Fact]
        public async Task Save_adds_a_source_not_stored_yet()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();

            var saved = await SaveAsync(unitOfWork, new TranslationRequest { Source = " Báo  cáo ", De = "Bericht" });

            var row = Assert.Single(saved);
            Assert.Equal("Báo cáo", row.Source);
            Assert.Equal("Bericht", row.De);
        }

        [Fact]
        public async Task Save_marks_and_unmarks_ignored()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();
            unitOfWork.Seed("Lily Flower Earrings");

            Assert.True(Assert.Single(await SaveAsync(unitOfWork, new TranslationRequest { Source = "Lily Flower Earrings", Ignored = true })).Ignored);
            Assert.False(Assert.Single(await SaveAsync(unitOfWork, new TranslationRequest { Source = "Lily Flower Earrings", Ignored = false })).Ignored);
        }

        [Fact]
        public async Task Save_same_source_twice_keeps_the_last_one()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();

            var saved = await SaveAsync(unitOfWork,
                new TranslationRequest { Source = "Báo cáo", De = "Erst" },
                new TranslationRequest { Source = "Báo cáo ", De = "Bericht" });

            Assert.Equal("Bericht", Assert.Single(saved).De);
        }

        [Fact]
        public async Task Query_returns_rows_sorted_by_source()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();
            unitOfWork.Seed("Tổng cộng", "Gesamt");
            unitOfWork.Seed("Báo cáo");

            var result = await new GetTranslationsHandler(unitOfWork).Handle(new GetTranslationsQuery(), CancellationToken.None);

            Assert.Equal(["Báo cáo", "Tổng cộng"], result.Data!.Select(x => x.Source).ToArray());
        }

        [Theory]
        [InlineData("", false)]
        [InlineData("   ", false)]
        [InlineData("Khoản thu", true)]
        public void Validators_require_a_source(string source, bool valid)
        {
            Assert.Equal(valid, new SaveTranslationsValidator().Validate(
                new SaveTranslationsCommand { Items = [new TranslationRequest { Source = source, De = "x" }] }).IsValid);
            Assert.Equal(valid, new DiscoverTranslationsValidator().Validate(
                new DiscoverTranslationsCommand { Sources = [source] }).IsValid);
        }

        [Fact]
        public void Validators_reject_too_long_texts_and_too_big_batches()
        {
            var longSource = new string('a', Translation.SourceMaxLength + 1);
            var longText = new string('a', Translation.TextMaxLength + 1);

            Assert.False(new SaveTranslationsValidator().Validate(
                new SaveTranslationsCommand { Items = [new TranslationRequest { Source = longSource }] }).IsValid);
            Assert.False(new SaveTranslationsValidator().Validate(
                new SaveTranslationsCommand { Items = [new TranslationRequest { Source = "Khoản thu", De = longText }] }).IsValid);
            Assert.False(new DiscoverTranslationsValidator().Validate(
                new DiscoverTranslationsCommand { Sources = Enumerable.Range(0, Translation.DiscoverBatchMax + 1).Select(i => $"chữ {i}").ToList() }).IsValid);
        }

        [Fact]
        public async Task Delete_removes_only_the_sources_sent()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();
            unitOfWork.Seed("Biên LN");
            unitOfWork.Seed("Tổng cộng", "Gesamt");

            var result = await new DeleteTranslationsHandler(unitOfWork)
                .Handle(new DeleteTranslationsCommand { Sources = [" Biên  LN ", "Không có"] }, CancellationToken.None);

            Assert.Equal(1, result.Data!.Deleted);
            Assert.Equal("Tổng cộng", Assert.Single(unitOfWork.Rows).Source);
        }

        [Fact]
        public async Task Delete_with_nothing_to_remove_does_not_commit()
        {
            var unitOfWork = new InMemoryTranslationUnitOfWork();

            var result = await new DeleteTranslationsHandler(unitOfWork)
                .Handle(new DeleteTranslationsCommand { Sources = ["Không có"] }, CancellationToken.None);

            Assert.Equal(0, result.Data!.Deleted);
            Assert.Equal(0, unitOfWork.Commits);
        }
    }
}
