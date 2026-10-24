using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Commands.Handlers
{
    public sealed class DiscoverTranslationsHandler : IRequestHandler<DiscoverTranslationsCommand, Response<TranslationDiscoverResponse>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;

        public DiscoverTranslationsHandler(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<Response<TranslationDiscoverResponse>> Handle(DiscoverTranslationsCommand request, CancellationToken cancellationToken)
        {
            var sources = request.Sources.Select(Translation.Normalize).Where(x => x.Length > 0).Distinct().ToList();
            var known = (await _unitOfWork.TranslationRepository.GetByHashesAsync(sources.Select(Translation.HashOf).ToList(), cancellationToken))
                .Select(x => x.SourceHash)
                .ToHashSet();
            var fresh = sources.Where(x => !known.Contains(Translation.HashOf(x))).ToList();
            if (fresh.Count > 0)
            {
                fresh.ForEach(x => _unitOfWork.TranslationRepository.Add(TranslationRules.NewRow(x)));
                await _unitOfWork.CommitAsync(cancellationToken);
            }
            return Response<TranslationDiscoverResponse>.Ok(new TranslationDiscoverResponse { Added = fresh.Count });
        }
    }
}
