using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Queries.Handlers
{
    public sealed class GetTranslationsHandler : IRequestHandler<GetTranslationsQuery, Response<List<TranslationResponse>>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;

        public GetTranslationsHandler(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<Response<List<TranslationResponse>>> Handle(GetTranslationsQuery request, CancellationToken cancellationToken)
        {
            var rows = await _unitOfWork.TranslationRepository.GetAllAsync(cancellationToken);
            return Response<List<TranslationResponse>>.Ok(rows.Select(TranslationRules.ToResponse).ToList());
        }
    }
}
