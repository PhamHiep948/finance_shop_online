using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Commands.Handlers
{
    public sealed class SaveTranslationsHandler : IRequestHandler<SaveTranslationsCommand, Response<List<TranslationResponse>>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;

        public SaveTranslationsHandler(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<Response<List<TranslationResponse>>> Handle(SaveTranslationsCommand request, CancellationToken cancellationToken)
        {
            var repository = _unitOfWork.TranslationRepository;
            // The last item wins when the same source is sent twice.
            var items = request.Items
                .Select(x => (Source: Translation.Normalize(x.Source), x.De, x.Ignored))
                .GroupBy(x => x.Source)
                .Select(g => g.Last())
                .ToList();
            var existing = (await repository.GetByHashesAsync(items.Select(x => Translation.HashOf(x.Source)).ToList(), cancellationToken))
                .ToDictionary(x => x.SourceHash);
            foreach (var item in items)
            {
                if (!existing.TryGetValue(Translation.HashOf(item.Source), out var row))
                {
                    row = TranslationRules.NewRow(item.Source);
                    repository.Add(row);
                }
                row.De = TranslationRules.Clean(item.De);
                row.Ignored = item.Ignored;
            }
            await _unitOfWork.CommitAsync(cancellationToken);

            var rows = await repository.GetAllAsync(cancellationToken);
            return Response<List<TranslationResponse>>.Ok(rows.Select(TranslationRules.ToResponse).ToList());
        }
    }
}
