using Fin.Domain.Finance.Entities;
using Fin.Model.Dto.Finance.Responses;

namespace Fin.Infrastructure.Finance.Interfaces
{
    public interface ICategoryRepository
    {
        Task<List<CategoryResponse>> GetListAsync(string kind, CancellationToken cancellationToken);

        Task<Category?> GetByIdAsync(long id, string kind, CancellationToken cancellationToken);

        Task<bool> ExistsAsync(long id, string kind, CancellationToken cancellationToken);

        Task<bool> NameExistsAsync(string kind, string name, long? excludeId, CancellationToken cancellationToken);

        Task<long?> FindIdByNameAsync(string kind, string name, CancellationToken cancellationToken);


        Task<int> CountEntriesAsync(long id, string kind, bool deleted, CancellationToken cancellationToken);

        Task<int> ClearScopeAsync(long scopeId, CancellationToken cancellationToken);

        void Add(Category category);

        void Remove(Category category);
    }
}
