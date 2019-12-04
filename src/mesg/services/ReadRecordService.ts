import { ReadRecord } from 'mesg/models/ReadRecord';
import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { User } from 'auth/models/User';
import { Messenger } from 'mesg/models/Messenger';

@Service()
export class ReadRecordService {
  @InjectRepository(ReadRecord) private repo!: Repository<ReadRecord>;

  async setLastReadDate(
    userId: string,
    messenger: Messenger,
    date: Date
  ): Promise<void> {
    let record: ReadRecord;

    const existingRecord = await this.repo.findOne({
      where: { user: { id: userId }, messenger: { id: messenger.id } }
    });

    if (existingRecord) record = existingRecord;
    else {
      const newRecord = this.repo.create();
      newRecord.user = { id: userId } as User;
      newRecord.messenger = messenger;
      record = newRecord;
    }

    record.date = date;
    await this.repo.save(record);
  }

  async getLastReadDate(
    userId: string,
    messengerId: string
  ): Promise<Date | null> {
    const record = await this.repo.findOne({
      user: { id: userId },
      messenger: { id: messengerId }
    });
    if (record) return record.date;
    return null;
  }
}
