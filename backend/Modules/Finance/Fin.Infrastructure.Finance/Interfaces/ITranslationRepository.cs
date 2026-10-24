using Fin.Domain.Finance.Entities;

namespace Fin.Infrastructure.Finance.Interfaces
{
    public interface ITranslationRepository
    {
        Task<List<Translation>> GetAllAsync(CancellationToken cancellationToken);

        Task<List<Translation>> GetByHashesAsync(IReadOnlyCollection<string> hashes, CancellationToken cancellationToken);

        void Add(Translation translation);

        void Remove(Translation translation);
    }
}
