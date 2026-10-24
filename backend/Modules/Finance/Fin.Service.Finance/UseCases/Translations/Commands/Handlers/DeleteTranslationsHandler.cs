using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Interfaces;
using Fin.Infrastructure.Shared.Wrappers;
using Fin.Model.Dto.Finance.Responses;
using MediatR;

namespace Fin.Service.Finance.UseCases.Translations.Commands.Handlers
{
    public sealed class DeleteTranslationsHandler : IRequestHandler<DeleteTranslationsCommand, Response<TranslationDeleteResponse>>
    {
        private readonly IFinanceUnitOfWork _unitOfWork;

        public DeleteTranslationsHandler(IFinanceUnitOfWork unitOfWork)
        {
            _unitOfWork = unitOfWork;
        }

        public async Task<Response<TranslationDeleteResponse>> Handle(DeleteTranslationsCommand request, CancellationToken cancellationToken)
        {
            var hashes = request.Sources.Select(Translation.Normalize).Where(x => x.Length > 0).Distinct().Select(Translation.HashOf).ToList();
            var rows = await _unitOfWork.TranslationRepository.GetByHashesAsync(hashes, cancellationToken);
            if (rows.Count > 0)
            {
                rows.ForEach(_unitOfWork.TranslationRepository.Remove);
                await _unitOfWork.CommitAsync(cancellationToken);
            }
            return Response<TranslationDeleteResponse>.Ok(new TranslationDeleteResponse { Deleted = rows.Count });
        }
    }
}
